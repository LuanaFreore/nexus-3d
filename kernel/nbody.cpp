// NEXUS 3D — kernel de física N-body em C++20 exposto via pybind11.
//
// nbody_step(positions, velocities, masses, dt, G, softening)
//   - positions/velocities: arrays NumPy float64 (N,3), modificados in-place (zero-copy)
//   - masses: array NumPy float64 (N,)
//   - integração: semi-implícita de Euler (kick-drift), O(n²) com softening ε²
//   - colisão: quando r² < (0.5·softening)², merge conservando momento linear
//     (corpo j é absorvido por i: massa/posição/velocidade ponderadas por massa,
//      massa[j] ← 0 e j deixa de participar da dinâmica)
//   - retorna: número de merges realizados no step

#include <pybind11/pybind11.h>
#include <pybind11/numpy.h>

#include <cmath>
#include <concepts>
#include <cstddef>
#include <span>
#include <stdexcept>
#include <vector>

namespace py = pybind11;

namespace nexus {

template <std::floating_point T>
struct Vec3 {
    T x, y, z;
};

/// Step O(n²) sobre buffers crus (contíguos, row-major, N×3).
/// Implementação única, independente de pybind11 — testável/benchmarkável em C++ puro.
template <std::floating_point T>
std::size_t nbody_step_impl(std::span<T> pos, std::span<T> vel, std::span<T> mass,
                            T dt, T G, T softening) {
    const std::size_t n = mass.size();
    const T eps2 = softening * softening;
    const T merge_r2 = T{0.25} * eps2;  // raio de captura = softening/2
    std::size_t merges = 0;

    // --- Forças (kick) ------------------------------------------------------
    // Laço par-a-par simétrico: i<j, acumula em ambos (Newton's 3rd law).
    // O(n²)/2 interações, cache-friendly, sem alocações.
    std::vector<T> ax(n, T{0}), ay(n, T{0}), az(n, T{0});

    for (std::size_t i = 0; i < n; ++i) {
        if (mass[i] == T{0}) continue;
        const T xi = pos[3 * i], yi = pos[3 * i + 1], zi = pos[3 * i + 2];
        for (std::size_t j = i + 1; j < n; ++j) {
            if (mass[j] == T{0}) continue;
            const T dx = pos[3 * j] - xi;
            const T dy = pos[3 * j + 1] - yi;
            const T dz = pos[3 * j + 2] - zi;
            const T r2 = dx * dx + dy * dy + dz * dz;

            if (r2 < merge_r2) {
                // Merge conservando momento: i absorve j.
                const T m = mass[i] + mass[j];
                const T wi = mass[i] / m, wj = mass[j] / m;
                pos[3 * i]     = wi * pos[3 * i]     + wj * pos[3 * j];
                pos[3 * i + 1] = wi * pos[3 * i + 1] + wj * pos[3 * j + 1];
                pos[3 * i + 2] = wi * pos[3 * i + 2] + wj * pos[3 * j + 2];
                vel[3 * i]     = wi * vel[3 * i]     + wj * vel[3 * j];
                vel[3 * i + 1] = wi * vel[3 * i + 1] + wj * vel[3 * j + 1];
                vel[3 * i + 2] = wi * vel[3 * i + 2] + wj * vel[3 * j + 2];
                mass[i] = m;
                mass[j] = T{0};
                ++merges;
                continue;
            }

            const T inv_r3 = T{1} / ((r2 + eps2) * std::sqrt(r2 + eps2));
            const T si = G * mass[j] * inv_r3;  // aceleração em i por j
            const T sj = G * mass[i] * inv_r3;  // aceleração em j por i
            ax[i] += si * dx; ay[i] += si * dy; az[i] += si * dz;
            ax[j] -= sj * dx; ay[j] -= sj * dy; az[j] -= sj * dz;
        }
    }

    // --- Integração kick-drift (Euler semi-implícita) -----------------------
    for (std::size_t i = 0; i < n; ++i) {
        if (mass[i] == T{0}) continue;
        vel[3 * i]     += ax[i] * dt;
        vel[3 * i + 1] += ay[i] * dt;
        vel[3 * i + 2] += az[i] * dt;
        pos[3 * i]     += vel[3 * i] * dt;
        pos[3 * i + 1] += vel[3 * i + 1] * dt;
        pos[3 * i + 2] += vel[3 * i + 2] * dt;
    }
    return merges;
}

}  // namespace nexus

/// Binding pybind11 — zero-copy: recebe buffers NumPy e modifica in-place.
std::size_t nbody_step(py::array_t<double, py::array::c_style | py::array::forcecast> positions,
                       py::array_t<double, py::array::c_style | py::array::forcecast> velocities,
                       py::array_t<double, py::array::c_style | py::array::forcecast> masses,
                       double dt, double G, double softening) {
    const auto pos_buf = positions.request();
    const auto vel_buf = velocities.request();
    const auto m_buf = masses.request();

    if (pos_buf.ndim != 2 || pos_buf.shape[1] != 3)
        throw std::invalid_argument("positions deve ter shape (N, 3)");
    if (vel_buf.ndim != 2 || vel_buf.shape[0] != pos_buf.shape[0] || vel_buf.shape[1] != 3)
        throw std::invalid_argument("velocities deve ter o mesmo shape (N, 3) de positions");
    if (m_buf.ndim != 1 || m_buf.shape[0] != pos_buf.shape[0])
        throw std::invalid_argument("masses deve ter shape (N,)");
    if (dt <= 0.0 || G <= 0.0 || softening < 0.0)
        throw std::invalid_argument("dt/G devem ser > 0 e softening >= 0");

    const std::size_t n = static_cast<std::size_t>(pos_buf.shape[0]);

    // GIL liberado durante o laço pesado — o chamador pode seguir renderizando.
    py::gil_scoped_release release;
    return nexus::nbody_step_impl<double>(
        std::span<double>(static_cast<double*>(pos_buf.ptr), 3 * n),
        std::span<double>(static_cast<double*>(vel_buf.ptr), 3 * n),
        std::span<double>(static_cast<double*>(m_buf.ptr), n),
        dt, G, softening);
}

PYBIND11_MODULE(nbody_kernel, m) {
    m.doc() = "NEXUS 3D — kernel N-body O(n²) em C++20 (kick-drift, softening, merge conservativo)";
    m.def("nbody_step", &nbody_step,
          py::arg("positions"), py::arg("velocities"), py::arg("masses"),
          py::arg("dt") = 0.01, py::arg("G") = 1.0, py::arg("softening") = 0.05,
          "Avança um step da simulação N-body in-place. Retorna nº de merges.");
}

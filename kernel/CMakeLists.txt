cmake_minimum_required(VERSION 3.20)
project(nexus_nbody_kernel LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()

# Python 3 + NumPy
find_package(Python3 REQUIRED COMPONENTS Interpreter Development.Module NumPy)

# pybind11 via pip (`python -m pybind11 --cmakedir`)
execute_process(
  COMMAND ${Python3_EXECUTABLE} -m pybind11 --cmakedir
  OUTPUT_VARIABLE pybind11_DIR
  OUTPUT_STRIP_TRAILING_WHITESPACE
)
find_package(pybind11 CONFIG REQUIRED)

pybind11_add_module(nbody_kernel nbody.cpp)
target_compile_features(nbody_kernel PRIVATE cxx_std_20)
target_include_directories(nbody_kernel PRIVATE ${Python3_NumPy_INCLUDE_DIRS})

if(CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang")
  target_compile_options(nbody_kernel PRIVATE -O3 -march=native -Wall -Wextra)
elseif(MSVC)
  target_compile_options(nbody_kernel PRIVATE /O2 /arch:AVX2)
endif()

# OpenMP opcional (paraleliza o laço de forças quando disponível)
find_package(OpenMP QUIET)
if(OpenMP_CXX_FOUND)
  target_link_libraries(nbody_kernel PRIVATE OpenMP::OpenMP_CXX)
  message(STATUS "nbody_kernel: OpenMP habilitado")
else()
  message(STATUS "nbody_kernel: OpenMP não encontrado — build single-thread")
endif()

// core_cpp/src/matrix_ops.cpp
#include <vector>
#include <cmath>
#include <limits>
#include <iostream> // Necesario para std::cout
#include <wasm_simd128.h>

#include "../vendor/eigen-3.4.0/Eigen/Dense"
#include "../vendor/eigen-3.4.0/Eigen/SVD"

#include <emscripten/bind.h>
#include <emscripten/val.h>

using namespace Eigen;
using namespace emscripten;

// --- Tipos ---
typedef Matrix<float, 3, 3> Matrix3f;
typedef Matrix<float, 8, 8> Matrix8f;
typedef Matrix<float, 8, 1> Vector8f;
// Usar un epsilon consistente, quizás un poco más relajado que el de SVD si es necesario
const float MATRIX_INVERSE_EPSILON = 1e-7f; // Epsilon específico para la inversa
const float MATRIX_SVD_EPSILON = 1e-6f;     // Epsilon para SVD (como estaba antes)

// --- Funciones C++ ---

void multiply_matrices(uintptr_t a_ptr, uintptr_t b_ptr, uintptr_t out_ptr)
{
    Map<const Matrix3f> a((const float *)a_ptr);
    Map<const Matrix3f> b((const float *)b_ptr);
    Map<Matrix3f> out((float *)out_ptr);
    out = a * b;
}

float determinant(uintptr_t m_ptr)
{
    Map<const Matrix3f> m((const float *)m_ptr);
    return m.determinant();
}

int invert_matrix(uintptr_t m_ptr, uintptr_t out_ptr)
{
    Map<const Matrix3f> m((const float *)m_ptr);
    Map<Matrix3f> out((float *)out_ptr);

    Eigen::IOFormat OctaveFmt(Eigen::StreamPrecision, 0, ", ", ";\n", "[", "]", "[", "]");
    // std::cout << "invert_matrix C++: Input matrix M:\n" << m.format(OctaveFmt) << std::endl; // Log opcional

    FullPivLU<Matrix3f> lu(m);
    float det = lu.determinant();

    // std::cout << "invert_matrix C++: LU determinant: " << det << std::endl; // Log opcional
    // std::cout << "invert_matrix C++: Comparing abs(det) < MATRIX_INVERSE_EPSILON (" << MATRIX_INVERSE_EPSILON << ")" << std::endl; // Log opcional

    if (std::abs(det) < MATRIX_INVERSE_EPSILON)
    {
        // std::cout << "invert_matrix C++: Determinant below epsilon, marking as non-invertible." << std::endl; // Log opcional
        out.setConstant(std::numeric_limits<float>::quiet_NaN());
        return 0; // <-- Devolver 0 para fallo
    }

    out = lu.inverse();
    // std::cout << "invert_matrix C++: Calculated inverse:\n" << out.format(OctaveFmt) << std::endl; // Log opcional

    if (out.array().isNaN().any() || out.array().isInf().any())
    {
        // std::cerr << "invert_matrix C++: Warning - Inverse calculation resulted in NaN/Inf." << std::endl; // Log opcional
        // return 0; // Podrías devolver fallo aquí también si quieres
    }

    // std::cout << "invert_matrix C++: Returning 1 (success)" << std::endl; // Log opcional
    return 1; // <-- Devolver 1 para éxito
}

bool solve_homography_svd(uintptr_t a_ptr, uintptr_t b_ptr, uintptr_t x_ptr)
{
    Map<const Matrix8f> A((const float *)a_ptr);
    Map<const Vector8f> b((const float *)b_ptr);
    Map<Vector8f> x((float *)x_ptr);

    JacobiSVD<Matrix8f> svd(A, ComputeFullU | ComputeFullV);

    if (svd.info() != Success)
    {
        x.setConstant(std::numeric_limits<float>::quiet_NaN());
        return false;
    }

    // Usar el epsilon definido para SVD
    float threshold = MATRIX_SVD_EPSILON * svd.singularValues().maxCoeff();
    if ((svd.singularValues().array().abs() < threshold).any())
    {
        x.setConstant(std::numeric_limits<float>::quiet_NaN());
        return false;
    }

    x = svd.solve(b);

    if (x.array().isNaN().any())
    {
        return false;
    }

    return true;
}

void transform_points_batch(uintptr_t matrix_ptr, uintptr_t points_in_ptr, uintptr_t points_out_ptr, int num_points)
{
    Map<const Matrix3f> M((const float *)matrix_ptr);
    const float *pts_in = (const float *)points_in_ptr;
    float *pts_out = (float *)points_out_ptr;

    // --- Coeficientes de Matriz en Vectores SIMD ---
    // Usamos wasm_f32x4_splat para repetir el coeficiente en las 4 vías del vector
    const v128_t m0_v = wasm_f32x4_splat(M(0, 0)); // m[0]
    const v128_t m1_v = wasm_f32x4_splat(M(1, 0)); // m[1]
    const v128_t m2_v = wasm_f32x4_splat(M(2, 0)); // m[2]
    const v128_t m3_v = wasm_f32x4_splat(M(0, 1)); // m[3]
    const v128_t m4_v = wasm_f32x4_splat(M(1, 1)); // m[4]
    const v128_t m5_v = wasm_f32x4_splat(M(2, 1)); // m[5]
    const v128_t m6_v = wasm_f32x4_splat(M(0, 2)); // m[6] (Tx)
    const v128_t m7_v = wasm_f32x4_splat(M(1, 2)); // m[7] (Ty)
    const v128_t m8_v = wasm_f32x4_splat(M(2, 2)); // m[8] (W scale)

    // --- Constantes SIMD ---
    const v128_t epsilon_v = wasm_f32x4_splat(MATRIX_SVD_EPSILON); // Podría ser otro epsilon
    const v128_t one_v = wasm_f32x4_splat(1.0f);
    const v128_t nan_v = wasm_f32x4_splat(std::numeric_limits<float>::quiet_NaN());

    int i = 0;
    const int num_points_simd = num_points - (num_points % 4); // Número de puntos a procesar con SIMD

    // --- Bucle Principal SIMD (procesa 4 puntos a la vez) ---
    for (; i < num_points_simd; i += 4)
    {
        int base_idx = i * 2; // Índice base en el array de floats (xyxy...)

        // Cargar 8 floats = 4 puntos (x1,y1,x2,y2) y (x3,y3,x4,y4)
        // Asume alineación de 16 bytes. Usar wasm_v128_load_unaligned si no es seguro.
        v128_t points_xy12 = wasm_v128_load(&pts_in[base_idx]);
        v128_t points_xy34 = wasm_v128_load(&pts_in[base_idx + 4]);

        // Reorganizar a xxxx y yyyy usando wasm_i32x4_shuffle
        // Los índices se refieren a las vías de 32 bits:
        // 0=x1, 1=y1, 2=x2, 3=y2 (en points_xy12)
        // 4=x3, 5=y3, 6=x4, 7=y4 (en points_xy34)
        v128_t x1234 = wasm_i32x4_shuffle(points_xy12, points_xy34, 0, 2, 4, 6); // x1,x2,x3,x4
        v128_t y1234 = wasm_i32x4_shuffle(points_xy12, points_xy34, 1, 3, 5, 7); // y1,y2,y3,y4

        // --- Calcular X = m0*x + m3*y + m6 ---
        v128_t x_p1 = wasm_f32x4_mul(m0_v, x1234);
        v128_t x_p2 = wasm_f32x4_mul(m3_v, y1234);
        v128_t x_unscaled = wasm_f32x4_add(wasm_f32x4_add(x_p1, x_p2), m6_v);

        // --- Calcular Y = m1*x + m4*y + m7 ---
        v128_t y_p1 = wasm_f32x4_mul(m1_v, x1234);
        v128_t y_p2 = wasm_f32x4_mul(m4_v, y1234);
        v128_t y_unscaled = wasm_f32x4_add(wasm_f32x4_add(y_p1, y_p2), m7_v);

        // --- Calcular W = m2*x + m5*y + m8 ---
        v128_t w_p1 = wasm_f32x4_mul(m2_v, x1234);
        v128_t w_p2 = wasm_f32x4_mul(m5_v, y1234);
        v128_t w = wasm_f32x4_add(wasm_f32x4_add(w_p1, w_p2), m8_v);

        // --- División por W y manejo de W cercano a cero ---
        v128_t w_abs = wasm_f32x4_abs(w);
        v128_t valid_w_mask = wasm_f32x4_ge(w_abs, epsilon_v); // 1s donde |W| >= eps, 0s donde |W| < eps
        v128_t inv_w = wasm_f32x4_div(one_v, w); // Calcula 1/W (puede ser Inf si W=0)

        // Multiplicar X e Y por invW
        v128_t x_scaled = wasm_f32x4_mul(x_unscaled, inv_w);
        v128_t y_scaled = wasm_f32x4_mul(y_unscaled, inv_w);

        // Seleccionar el resultado escalado donde W es válido, o NaN donde no lo es
        // wasm_v128_bitselect(if_mask_true, if_mask_false, mask)
        v128_t x_final = wasm_v128_bitselect(x_scaled, nan_v, valid_w_mask);
        v128_t y_final = wasm_v128_bitselect(y_scaled, nan_v, valid_w_mask);

        // --- Reorganizar de nuevo a xyxy para almacenar ---
        // Índices para shuffle se refieren a las vías de 32 bits:
        // 0=x'1, 1=x'2, 2=x'3, 3=x'4 (en x_final)
        // 4=y'1, 5=y'2, 6=y'3, 7=y'4 (en y_final)
        v128_t out_xy12 = wasm_i32x4_shuffle(x_final, y_final, 0, 4, 1, 5); // x'1, y'1, x'2, y'2
        v128_t out_xy34 = wasm_i32x4_shuffle(x_final, y_final, 2, 6, 3, 7); // x'3, y'3, x'4, y'4

        // Almacenar los 8 floats = 4 puntos transformados
        // Asume alineación. Usar wasm_v128_store_unaligned si no.
        wasm_v128_store(&pts_out[base_idx], out_xy12);
        wasm_v128_store(&pts_out[base_idx + 4], out_xy34);
    }

    // --- Bucle Escalar Residual (procesa los 0-3 puntos restantes) ---
    // Extraer coeficientes escalares una vez si quedan puntos
    if (i < num_points) {
         const float m0_s = M(0, 0), m1_s = M(1, 0), m2_s = M(2, 0);
         const float m3_s = M(0, 1), m4_s = M(1, 1), m5_s = M(2, 1);
         const float m6_s = M(0, 2), m7_s = M(1, 2), m8_s = M(2, 2);

         for (; i < num_points; ++i)
         {
             int idx = i * 2;
             float x_in = pts_in[idx];
             float y_in = pts_in[idx + 1];

             float X = m0_s * x_in + m3_s * y_in + m6_s;
             float Y = m1_s * x_in + m4_s * y_in + m7_s;
             float W = m2_s * x_in + m5_s * y_in + m8_s;

             if (std::abs(W) < MATRIX_SVD_EPSILON) // Usar el mismo epsilon
             {
                 pts_out[idx] = std::numeric_limits<float>::quiet_NaN();
                 pts_out[idx + 1] = std::numeric_limits<float>::quiet_NaN();
             }
             else
             {
                 float invW = 1.0f / W;
                 pts_out[idx] = X * invW;
                 pts_out[idx + 1] = Y * invW;
             }
         }
    }
}

// --- Embind ---
EMSCRIPTEN_BINDINGS(matrix_module)
{
    function("multiplyMatrices", &multiply_matrices, allow_raw_pointers());
    function("determinant", &determinant, allow_raw_pointers());
    function("invertMatrix", &invert_matrix, allow_raw_pointers());
    function("solveHomographySVD", &solve_homography_svd, allow_raw_pointers());
    function("transformPointsBatch", &transform_points_batch, allow_raw_pointers());
}
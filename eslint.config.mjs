import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Aplikasi ini mengambil data lewat Supabase di sisi client: tiap halaman
      // memuat data di useEffect lalu menaruhnya ke state (pola
      // `useEffect(() => { load(); }, [load])`).
      //
      // Rule ini meminta pola tersebut ditinggalkan sama sekali — artinya
      // pindah ke server component atau library data-fetching (SWR/React
      // Query) untuk ~17 halaman. Itu perubahan arsitektur, bukan perbaikan
      // lint. Perlu dicatat juga: membungkus pemanggilan dengan IIFE async
      // membuat rule ini lolos TANPA mengubah apa pun saat runtime, jadi
      // "perbaikan" semacam itu hanya menyembunyikan pola yang sama dari
      // linter. Lebih jujur dimatikan di sini dengan alasan eksplisit.
      //
      // Kalau nanti halaman dipindah ke server component, hapus baris ini.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;

/**
 * Edge Functions 在 Deno 上运行；编辑器里的 TypeScript 默认按 Node 解析模块，
 * 无法识别 https URL 与 Deno 全局。本文件仅为 IDE / tsc 提供声明，不改变运行时。
 */

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
  env: { get(key: string): string | undefined };
};

declare module 'https://esm.sh/@supabase/supabase-js@2.57.4' {
  export function createClient(
    supabaseUrl: string,
    supabaseKey: string,
    options?: Record<string, unknown>,
  ): any;
}

/**
 * @oblivion/brand — Node 半边。
 *
 * 本插件只提供浏览器端呈现，node 侧是一个空的 `apply()`，作用与官方
 * `@deepseek-ai/dsh-client-ui-brand-official` 的 node 半边相同：给 Loader 留座位，
 * 并把包自身的 `dsh.client` 声明交给客户端模块表。
 *
 * 真正的品牌组件在 `./client/index.ts`，通过 `ctx.slots.inject` 注册槽位。
 */

/** Cordis 插件入口（无副作用）。 */
export function apply(): void {}

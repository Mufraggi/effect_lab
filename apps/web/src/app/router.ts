import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router"

/**
 * One route per slice. Each page is lazy so a slice's code only loads when
 * you navigate to it — the slice boundary is also the bundle boundary.
 */
const routes: ReadonlyArray<RouteRecordRaw> = [
  { path: "/", redirect: "/posts" },
  {
    path: "/posts",
    name: "posts",
    component: () => import("../features/posts/PostsPage.vue"),
    meta: { title: "Posts" }
  },
  {
    path: "/todo-optic",
    name: "todo-optic",
    component: () => import("../features/todo-optic/TodoOpticPage.vue"),
    meta: { title: "Todo — optics purs" }
  }
]

export const router = createRouter({
  history: createWebHistory(),
  routes: [...routes]
})

export const navigation = routes.filter((route) => route.name !== undefined)

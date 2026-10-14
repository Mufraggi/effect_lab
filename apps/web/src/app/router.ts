import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router"

/**
 * One route per slice: add a folder under `features/`, add an entry here.
 *
 * Each page is lazy, so the slice boundary is also the bundle boundary — a
 * slice only costs what it is worth to whoever navigates to it.
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
    path: "/todos",
    name: "todos",
    component: () => import("../features/todos/TodosPage.vue"),
    meta: { title: "Todos" }
  },
  // An unknown URL lands on the first slice rather than a blank page.
  { path: "/:pathMatch(.*)*", redirect: "/posts" }
]

export const router = createRouter({
  history: createWebHistory(),
  routes: [...routes]
})

export const navigation = routes.filter((route) => route.name !== undefined)

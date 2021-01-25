import preload from "../src/index.js";
import { mount, createLocalVue } from "@vue/test-utils";
import Router, { isNavigationFailure, NavigationFailureType } from "vue-router";

function div(attrs = {}) {
  return {
    render(h) {
      return h("div", {}, []);
    },
    ...attrs,
  };
}

const DIV = div();

function navigate(routes, path = "/", config = {}) {
  const router = new Router({
    routes: preload(routes, config),
  });

  const localVue = createLocalVue();
  localVue.use(Router);

  return new Promise((resolve, reject) => {
    const wrapper = mount(
      {
        render(h) {
          return h("router-view", {}, []);
        },
        errorCaptured(err) {
          reject(err);
          return false;
        },
      },
      {
        localVue,
        router,
      }
    );

    router.onError(reject);
    router.afterEach(() => {
      resolve(wrapper);
    });
    router.push(path).catch((err) => {
      if (!isNavigationFailure(err, NavigationFailureType.redirected)) {
        reject(err);
      }
    });
  });
}

describe("preload", () => {
  it("runs the route component preload methods", async () => {
    let called = false;
    await navigate([
      {
        path: "/",
        component: {
          extends: DIV,
          preload() {
            called = true;
          },
        },
      },
    ]);
    expect(called).toBe(true);
  });

  it("mixes the object returned by preload() to the component data", async () => {
    const wrapper = await navigate([
      {
        path: "/",
        component: div({
          name: "SomeComponent",
          preload() {
            return { a: 1 };
          },
        }),
      },
    ]);
    expect(wrapper.findComponent({ name: "SomeComponent" }).vm.a).toBe(1);
  });

  it("supports async preload()", async () => {
    const wrapper = await navigate([
      {
        path: "/",
        component: div({
          name: "SomeComponent",
          async preload() {
            return { a: 1 };
          },
        }),
      },
    ]);
    expect(wrapper.findComponent({ name: "SomeComponent" }).vm.a).toBe(1);
  });

  it("survives routes without components", async () => {
    const wrapper = await navigate([
      {
        path: "/",
        beforeEnter(to, from, next) {
          next("/foo");
        },
      },
      {
        path: "/foo",
        component: DIV,
      },
    ]);
    expect(wrapper.findComponent(DIV).exists()).toBe(true);
  });

  it("survives routes with props", async () => {
    const wrapper = await navigate(
      [
        {
          path: "/:id",
          props: true,
          component: DIV,
        },
      ],
      "/1"
    );
    expect(wrapper.findComponent(DIV).exists()).toBe(true);
  });

  it("supports named views", async () => {
    const wrapper = await navigate([
      {
        path: "/",
        component: {
          render(h) {
            return h("router-view", { props: { name: "first" } }, []);
          },
        },
        children: [
          {
            path: "",
            components: {
              first: new div({
                name: "SomeComponent",
                preload() {
                  return { a: 1 };
                },
              }),
            },
          },
        ],
      },
    ]);
    expect(wrapper.findComponent({ name: "SomeComponent" }).vm.a).toBe(1);
  });

  it("redirects when a redirect() result is returned", async () => {
    const wrapper = await navigate([
      {
        path: "/",
        component: {
          preload({ redirect }) {
            return redirect("/test");
          },
        },
      },
      {
        path: "/test",
        component: DIV,
      },
    ]);
    expect(wrapper.findComponent(DIV).exists()).toBe(true);
  });

  it("renders the error component when a error() result is returned", async () => {
    const wrapper = await navigate(
      [
        {
          path: "/",
          component: {
            preload({ error }) {
              return error();
            },
          },
        },
      ],
      "/",
      { errorComponent: DIV }
    );
    expect(wrapper.findComponent(DIV).exists()).toBe(true);
  });
});

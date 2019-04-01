import preload from "../src/index.js";
import { mount, createLocalVue } from "@vue/test-utils";
import Router from "vue-router";

const DIV = {
  render(h) {
    return h("div", {}, []);
  }
};

function navigate(routes, path = "/") {
  const router = new Router({ routes: preload(routes) });

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
        }
      },
      {
        localVue,
        router
      }
    );

    router.push(path);
    router.onError(reject);
    router.onReady(() => resolve(wrapper));
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
          }
        }
      }
    ]);
    expect(called).toBe(true);
  });

  it("survives routes without components", async () => {
    const wrapper = await navigate([
      {
        path: "/",
        beforeEnter(to, from, next) {
          next("/foo");
        }
      },
      {
        path: "/foo",
        component: DIV
      }
    ]);
    expect(wrapper.contains(DIV)).toBe(true);
  });

  it("handles async components", async () => {
    const wrapper = await navigate(
      [
        {
          path: "/:id",
          props: true,
          component: async () => {
            return DIV;
          }
        }
      ],
      "/1"
    );
    expect(wrapper.contains(DIV)).toBe(true);
  });
});

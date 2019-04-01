import Vue from "vue";
import Router from "vue-router";
import preload from "../src/index.js";
import { expect } from "chai";

Vue.use(Router);

function navigate(routes, path = "/") {
  const r = new Router({ routes: preload(routes) });
  const p = new Promise((resolve, reject) => {
    r.onReady(() => resolve(r.currentRoute));
    r.onError(reject);
  });
  r.push(path);
  return p;
}

describe("preload", () => {
  it("runs the route component preload methods", async () => {
    let called = false;
    await navigate([
      {
        path: "/",
        component: {
          preload() {
            called = true;
          }
        }
      }
    ]);
    expect(called).to.be.true;
  });

  it("survives routes without components", async () => {
    await navigate([
      {
        path: "/"
      }
    ]);
  });
});

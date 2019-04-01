import Vue from "vue";
import Router from "vue-router";
import preload from "../src/index.js";
import { expect } from "chai";

Vue.use(Router);

const NavigationAborted = new Error();

function navigate(routes, path = "/") {
  const r = new Router({ routes: preload(routes) });
  return new Promise((resolve, reject) => {
    r.push(path, () => resolve(), () => reject(NavigationAborted));
  });
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
});

function mapRoutes(routes, func) {
  return routes.map(route => {
    return func({
      ...route,
      children: route.children && mapRoutes(route.children, func)
    });
  });
}

function defaultNoopHook() {}

const defaultErrorComponent = {
  functional: true,
  props: ["status", "error"],
  render(createElement, context) {
    return createElement("div", {}, [
      context.props.status + " " + context.props.error.message
    ]);
  }
};

const ACTION_ERROR = Symbol();
const ACTION_REDIRECT = Symbol();

function error(status = 404, message = "Not found") {
  return {
    $type: ACTION_ERROR,
    status,
    error: message instanceof Error ? message : { message }
  };
}

function redirect(to) {
  return {
    $type: ACTION_REDIRECT,
    to
  };
}

function componentPromise(component) {
  if (typeof component !== "function") {
    return Promise.resolve(component);
  }
  return new Promise((resolve, reject) => {
    Promise.resolve(component(resolve, reject)).then(resolve, reject);
  });
}

export default function preload(
  routes,
  {
    context = {},
    beforePreload = defaultNoopHook,
    afterPreload = defaultNoopHook,
    errorComponent = defaultErrorComponent
  } = {}
) {
  let component = null;
  const preloadKey = Symbol();

  const newRoutes = mapRoutes(routes, route => {
    const prepare = async () => {
      const resolved = await componentPromise(route.component);
      if (!resolved.preload) {
        return { key: null, preload: null, component: resolved };
      }
      const key = Symbol();
      return {
        key,
        preload: resolved.preload,
        component: {
          extends: resolved,
          inject: {
            $preload: preloadKey
          },
          data() {
            return { ...this.$preload[key] };
          }
        }
      };
    };

    let cached = null;
    const cachedPrepare = () => {
      if (!cached) {
        cached = prepare();
      }
      return cached;
    };

    return {
      ...route,
      meta: {
        ...route.meta,
        [preloadKey]: cachedPrepare
      },
      async component() {
        const { component } = await cachedPrepare();
        return component;
      }
    };
  });

  async function runPreload(to) {
    let action = null;
    const datas = {};

    beforePreload();
    try {
      for (const route of to.matched) {
        const prepare = route.meta[preloadKey];
        if (!prepare) {
          continue;
        }
        const { key, preload } = await prepare();
        if (!preload) {
          continue;
        }
        const data = await preload({ route: to, redirect, error, ...context });
        if (
          data &&
          (data.$type === ACTION_REDIRECT || data.$type === ACTION_ERROR)
        ) {
          action = data;
          break;
        }
        datas[key] = data;
      }
    } catch (err) {
      throw err;
    } finally {
      afterPreload();
    }

    if (!action) {
      component = {
        provide() {
          return {
            [preloadKey]: datas
          };
        },
        render(h) {
          return h("router-view", {
            attrs: this.$attrs
          });
        }
      };
    } else if (action.$type === ACTION_ERROR) {
      component = {
        render(h) {
          return h(errorComponent, {
            props: {
              status: action.status,
              error: action.error
            }
          });
        }
      };
    } else if (action.$type === ACTION_REDIRECT) {
      return action.to;
    } else {
      throw new Error("unknown action");
    }
  }

  return [
    {
      path: "",
      component: {
        beforeRouteEnter(to, from, next) {
          runPreload(to).then(next, next);
        },
        beforeRouteUpdate(to, from, next) {
          runPreload(to).then(next, next);
        },
        render(h) {
          return h(component, {
            key: this.$route.fullPath,
            attrs: this.$attrs
          });
        }
      },
      children: newRoutes
    }
  ];
}

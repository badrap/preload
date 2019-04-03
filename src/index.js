const mapRoutes = (routes, func) => {
  return routes.map(route => {
    return func({
      ...route,
      children: route.children && mapRoutes(route.children, func)
    });
  });
};

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

const error = (status = 404, message = "Not found") => {
  return {
    $type: ACTION_ERROR,
    status,
    error: message instanceof Error ? message : { message }
  };
};

const redirect = to => {
  return {
    $type: ACTION_REDIRECT,
    to
  };
};

const componentPromise = component => {
  if (typeof component !== "function") {
    return Promise.resolve(component);
  }
  return new Promise((resolve, reject) => {
    Promise.resolve(component(resolve, reject)).then(resolve, reject);
  }).then(resolved => (resolved.__esModule ? resolved.default : resolved));
};

export default function preload(
  routes,
  {
    context = {},
    errorComponent = defaultErrorComponent,
    beforePreload,
    afterPreload
  } = {}
) {
  let component;
  const preloadKey = Symbol();

  const cachedWrapper = component => {
    let cached = null;
    return () => {
      if (!cached) {
        cached = componentPromise(component).then(
          resolved => {
            if (!resolved.preload) {
              return resolved;
            }
            const key = Symbol();
            return {
              extends: resolved,
              [preloadKey]: {
                key,
                preload: resolved.preload
              },
              inject: {
                $preload: preloadKey
              },
              data() {
                return { ...this.$preload[key] };
              }
            };
          },
          err => {
            cached = null;
            return Promise.reject(err);
          }
        );
      }
      return cached;
    };
  };

  const newRoutes = mapRoutes(routes, route => {
    const newRoute = { ...route };
    if (newRoute.component) {
      newRoute.component = cachedWrapper(newRoute.component);
    }
    if (newRoute.components) {
      const components = {};
      Object.keys(newRoute.components).forEach(key => {
        components[key] = cachedWrapper(newRoute.components[key]);
      });
      newRoute.components = components;
    }
    return newRoute;
  });

  async function beforeRoute(to) {
    let action = null;
    const datas = {};

    if (beforePreload) {
      beforePreload();
    }

    try {
      for (let i = 0; i < to.matched.length; i++) {
        const route = to.matched[i];
        const keys = Object.keys(route.components);
        for (let j = 0; j < keys.length; j++) {
          const comp = await componentPromise(route.components[keys[j]]);
          if (!comp || !comp[preloadKey]) {
            continue;
          }
          const { key, preload } = comp[preloadKey];
          const data = await Promise.resolve(
            preload({ route: to, redirect, error, ...context })
          );

          if (data && data.$type === ACTION_REDIRECT) {
            return action.to;
          }
          if (data && data.$type === ACTION_ERROR) {
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
            return;
          }
          datas[key] = data;
        }
      }
    } finally {
      if (afterPreload) {
        afterPreload();
      }
    }

    component = {
      provide() {
        return {
          [preloadKey]: datas
        };
      },
      render(h) {
        return h("router-view", {
          attrs: { ...this.$attrs }
        });
      }
    };
  }

  return [
    {
      path: "",
      component: {
        beforeRouteEnter: (to, _, next) => beforeRoute(to).then(next, next),
        beforeRouteUpdate: (to, _, next) => beforeRoute(to).then(next, next),
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

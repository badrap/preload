function mapRoutes(routes, func) {
  return routes.map(route => {
    return func({
      ...route,
      children: route.children && mapRoutes(route.children, func)
    });
  });
}

const defaultErrorComponent = {
  functional: true,
  props: ["status", "error"],
  render(createElement, context) {
    return createElement("div", {}, [
      context.props.status + " " + context.props.error.message
    ]);
  }
};

const ACTION_ERROR = {};
const ACTION_REDIRECT = {};

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
  }).then(resolved => (resolved.__esModule ? resolved.default : resolved));
}

export default function preload(
  routes,
  {
    context = {},
    errorComponent = defaultErrorComponent,
    beforePreload,
    afterPreload
  } = {}
) {
  const preloadKey = Symbol();
  let component;

  const newRoutes = mapRoutes(routes, route => {
    let cached = null;
    const cachedPrepare = () => {
      if (!cached) {
        cached = componentPromise(route.component).then(
          resolved => {
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
          },
          err => {
            cached = null;
            return Promise.reject(err);
          }
        );
      }
      return cached;
    };

    return {
      ...route,
      meta: {
        ...route.meta,
        [preloadKey]: cachedPrepare
      },
      component() {
        return cachedPrepare().then(({ component }) => component);
      }
    };
  });

  function iterate(array, index, func) {
    if (index >= array.length) {
      return Promise.resolve();
    } else {
      return Promise.resolve(func(array[index])).then(() => {
        return iterate(array, index + 1, func);
      });
    }
  }

  function beforeRoute(to, _from, next) {
    let action = null;
    const datas = {};

    Promise.resolve()
      .then(() => {
        if (beforePreload) {
          beforePreload();
        }

        return iterate(to.matched, 0, route => {
          const prepare = route.meta[preloadKey];
          if (action || !prepare) {
            return;
          }
          return prepare().then(({ key, preload }) => {
            if (preload) {
              return Promise.resolve(
                preload({ route: to, redirect, error, ...context })
              ).then(data => {
                if (
                  data &&
                  (data.$type === ACTION_REDIRECT ||
                    data.$type === ACTION_ERROR)
                ) {
                  action = data;
                } else {
                  datas[key] = data;
                }
              });
            }
          });
        })
          .then(
            () => {
              if (afterPreload) {
                afterPreload();
              }
            },
            err => {
              if (afterPreload) {
                afterPreload();
              }
              throw err;
            }
          )
          .then(() => {
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
          });
      })
      .then(next, next);
  }

  return [
    {
      path: "",
      component: {
        beforeRouteEnter: beforeRoute,
        beforeRouteUpdate: beforeRoute,
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

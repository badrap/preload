// Execute `callback` for each `array` element asynchronously,
// without building a memory-hogging promise chain.
//
// The callback may return a promise/thenable, in which case the
// value will then be resolved before moving on to the next element.
// To facilitate early exits, the callback's return value may resolve
// to an object with a truthy property `break`.
//
// Return a promise that resolves to either the `callback`'s early
// exit value or `{ break: false }` otherwise.
function asyncFor(array, callback) {
  return new Promise((resolve, reject) => {
    function step(index) {
      try {
        if (index === array.length) {
          resolve({ break: false });
        } else {
          Promise.resolve(callback(array[index])).then(result => {
            if (result && result.break) {
              resolve(result);
            } else {
              step(index + 1);
            }
          }, reject);
        }
      } catch (err) {
        reject(err);
      }
    }
    step(0);
  });
}

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

export default function preload(routes, options = {}) {
  const {
    context = {},
    errorComponent = defaultErrorComponent,
    beforePreload,
    afterPreload
  } = options;

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

  function beforeRoute(to, _, next) {
    const datas = {};

    if (beforePreload) {
      beforePreload();
    }

    return asyncFor(to.matched, route => {
      return asyncFor(Object.keys(route.components), key => {
        return componentPromise(route.components[key]).then(comp => {
          if (!comp || !comp[preloadKey]) {
            return;
          }
          const { key, preload } = comp[preloadKey];
          return Promise.resolve(
            preload({ route: to, redirect, error, ...context })
          ).then(data => {
            if (data && data.$type === ACTION_REDIRECT) {
              return { break: true, value: data.to };
            }
            if (data && data.$type === ACTION_ERROR) {
              component = {
                render(h) {
                  return h(errorComponent, {
                    props: {
                      status: data.status,
                      error: data.error
                    }
                  });
                }
              };
              return { break: true };
            }
            datas[key] = data;
          });
        });
      });
    })
      .then(
        result => {
          if (afterPreload) {
            afterPreload();
          }
          if (result.break) {
            return result.value;
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
        },
        err => {
          if (afterPreload) {
            afterPreload();
          }
          throw err;
        }
      )
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

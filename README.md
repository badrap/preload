# @badrap/preload [![npm](https://img.shields.io/npm/v/@badrap/preload.svg)](https://www.npmjs.com/package/@badrap/preload)

Add a `preload` function to your [vue-router](https://router.vuejs.org/) route components, used for prepopulating data before those routes get rendered. Mostly modeled after Sapper's [`preload`](https://sapper.svelte.technology/guide#preloading), but also similar to Nuxt.js's [`asyncData`](https://nuxtjs.org/guide/async-data) and Next.js's [`getInitialProps`](https://nextjs.org/docs/#fetching-data-and-component-lifecycle).

## Installation

```sh
$ npm i @badrap/preload
```

## Usage

A modified of the following examples is available at [CodeSandbox](https://codesandbox.io/s/zywnmy35x?initialpath=%23%2Ffoo).

### Basic Setup

This module exports a single function. Use this function to decorate your route definitions before passing them to vue-router:

```js
import Vue from "vue";
import VueRouter from "vue-router";
import preload from "@badrap/preload"; // Import preload.
import Foo from "./Foo.vue"; // Import a couple of route components which
import Bar from "./Bar.vue"; // we decorate with preload.

Vue.use(VueRouter);

const routes = preload([
  // Use preload here to decorate the route components...
  { path: "/foo", component: Foo },
  { path: "/bar", component: Bar },
]);

const router = new VueRouter({
  routes, // ...and pass them to vue-router.
});

new Vue({
  router,
  template: "<router-view />",
}).$mount("#app");
```

### Adding Preloading to Components

After this setup dance the route components **Foo** and **Bar** can define a new method `preload` that is used to prepopulate their data whenever their route gets rendered - on initial render as well as route changes.

Let's define **Foo** in **Foo.vue**:

```vue
<template>
  <div>{{ greeting }}, {{ ip }}!</div>
</template>

<script>
import axios from "axios";

export default {
  async preload() {
    const { data } = await axios.get("https://api.ipify.org");
    return { ip: data };
  },
  data() {
    return { greeting: "Hello" };
  },
};
</script>
```

Rendering the route **/foo** would then show a div with the text _"Hello, 127.0.0.1!"_, or whatever your IP address happens to be instead of 127.0.0.1. This demonstrates two things:

- The properties returned by `preload` get combined with the properties returned by `data`.
- `preload` can be asynchronous (it doesn't have to, though).

### Context

The `preload` method gets a context object that contains useful information and helpers:

| Context property | Meaning                                                                                                                                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `route`          | The [route object](https://router.vuejs.org/api/#the-route-object) for the route that's currently being rendered.                                                                                                        |
| `redirect`       | A function whose return value you can return from `preload` to redirect the router to. Takes a [location descriptor](https://router.vuejs.org/guide/essentials/navigation.html#router-push-location-oncomplete-onabort). |
| `error`          | A function whose return value you can return from `preload` to signal a status error.                                                                                                                                    |

Here's an example that uses all of the above:

```vue
<script>
export default {
  async preload({ route, redirect, error }) {
    const { search } = route.query;
    if (!search) {
      return error(400, "?search= missing");
    }
    return redirect(
      "https://google.com/search?q=" + encodeURIComponent(search)
    );
  },
};
</script>
```

In addition to these properties you can mix in your own when decorating the route components:

```js
const routes = preload(..., {
  context: {
    appName: "My sweet app"
  }
);
```

After this `appName` will be a part of every context object passed to `preload` methods of the decorated route components.

### Hooks

In addition to extra context properties you can pass in two hooks. The `beforePreload` hook is executed before a route change causes `preload` methods to be called. The `afterPreload` hook gets executed when all of the `preload` calls are done.

```js
const routes = preload(..., {
  beforePreload(() => {
    // Start a progress indicator here.
  }),
  afterPreload(err => {
    // Stop and hide the progress indicator here.
  })
);
```

### Error Component

The default components that gets shown whenever `preload` returns a `context.error(...)` value can be replaced:

```js
const routes = preload(..., {
  errorComponent: ErrorComponent
});
```

## License

This library is licensed under the MIT license. See [LICENSE](./LICENSE).

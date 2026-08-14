export default {
  fetch(request) {
    const url = new URL(request.url);
    return Response.redirect("https://ruckus.to" + url.pathname + url.search, 301);
  },
};

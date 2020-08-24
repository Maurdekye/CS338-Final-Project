var $ = document.querySelector.bind(document);

(async () => {
  let navbar_content = await (await fetch("/navbar.htm")).text();
  $("div[data-navbar]").innerHTML = navbar_content;

  let response = await (await fetch("/api/getsession", {method: "POST"})).json();
  if (response.success) {
    $("#profile_link").href = "/profile/";
    $("#profile_link").innerHTML = `My Profile (${response.username})`;

    $("#logout_container").innerHTML = "<a href='#' onclick='logout()'>Logout</a>";
  }
})();

async function logout() {
  let response = await (await fetch("/api/logout", {method: "POST"})).json();
  if (response.success)
    window.location.href = "/";
}
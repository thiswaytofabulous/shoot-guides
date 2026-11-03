/* Shoot Guides — shared submit helper.
 * Replaces Netlify Forms. Each guide keeps its own success / error messages and just
 * swaps its old Netlify Forms fetch for:
 *
 *   ShootGuide.submit(formElement).then(function (ok) { ok ? showGotIt() : showTextJessi(); });
 *
 * Posts {action:"submit", client, form, fields} to /.netlify/functions/store, which saves
 * the submission, emails it through Resend, and feeds the TWTF Live Dashboard.
 * Client = <html data-client="rhcc">, or the first folder in the URL (/rhcc/ -> "rhcc").
 */
(function () {
  function clientSlug() {
    var tagged = document.documentElement.getAttribute("data-client");
    if (tagged) return tagged.toLowerCase();
    return (location.pathname.split("/").filter(Boolean)[0] || "").toLowerCase();
  }

  function formName(form) {
    var hidden = form.querySelector('input[name="form-name"]');
    return (hidden && hidden.value) || form.getAttribute("name") || form.id || "";
  }

  // FormData -> plain object; repeated names (checkbox groups) join into one answer.
  function fieldsOf(form) {
    var out = {};
    new FormData(form).forEach(function (value, key) {
      if (typeof value !== "string") return; // file inputs aren't supported
      out[key] = key in out ? out[key] + ", " + value : value;
    });
    return out;
  }

  // extraFields: more answers to include. draft: {doc, lines} to save as the shared latest version.
  function submit(form, extraFields, draft) {
    var fields = fieldsOf(form);
    if (extraFields) for (var k in extraFields) fields[k] = extraFields[k];
    return fetch("/.netlify/functions/store", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "submit",
        client: clientSlug(),
        form: formName(form),
        fields: fields,
        page: location.pathname,
        draft: draft || undefined
      })
    })
      .then(function (res) {
        return res.json().then(function (data) { return res.ok && data && data.ok === true; }, function () { return false; });
      })
      .catch(function () { return false; });
  }

  // Latest shared version of an editable doc, or null.
  function getDraft(doc) {
    return fetch("/.netlify/functions/store", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "draft-get", client: clientSlug(), doc: doc })
    })
      .then(function (res) { return res.ok ? res.json() : {}; })
      .then(function (d) { return (d && d.draft) || null; })
      .catch(function () { return null; });
  }

  window.ShootGuide = { submit: submit, getDraft: getDraft };
})();

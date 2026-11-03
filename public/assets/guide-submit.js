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
  // files: [{name, type, data(base64)}] from prepareImages.
  function submit(form, extraFields, draft, files) {
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
        draft: draft || undefined,
        files: files && files.length ? files : undefined
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

  // Shrink phone photos/screenshots before upload: long edge 1600px, JPEG. Unreadable files are skipped.
  function shrink(file) {
    return new Promise(function (resolve) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement("canvas");
        c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        var dataUrl = c.toDataURL("image/jpeg", 0.82);
        resolve({ name: (file.name || "screenshot").replace(/\.[^.]+$/, "") + ".jpg", type: "image/jpeg", data: dataUrl.split(",")[1], preview: dataUrl });
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }
  function prepareImages(fileList, max) {
    var list = [].slice.call(fileList || []).slice(0, max || 6);
    return Promise.all(list.map(shrink)).then(function (a) { return a.filter(Boolean); });
  }

  function call(body) {
    body.client = clientSlug();
    return fetch("/.netlify/functions/store", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(function (res) { return res.ok ? res.json() : null; }).catch(function () { return null; });
  }
  // Shared outfit inspo board: [{id, who, createdAt, images:[{key,url}], links:[url]}]
  function getInspo() { return call({ action: "inspo-list" }).then(function (d) { return (d && d.items) || []; }); }
  function hideInspo(id, item) { return call({ action: "inspo-hide", id: id, item: item }).then(function (d) { return !!(d && d.ok); }); }

  window.ShootGuide = { submit: submit, getDraft: getDraft, prepareImages: prepareImages, getInspo: getInspo, hideInspo: hideInspo };
})();

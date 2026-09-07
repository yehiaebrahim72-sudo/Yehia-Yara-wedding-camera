const loginCard = document.getElementById("loginCard");
const dashboard = document.getElementById("dashboard");
const loginForm = document.getElementById("loginForm");
const loginStatus = document.getElementById("loginStatus");
const adminStatus = document.getElementById("adminStatus");
const mediaGrid = document.getElementById("mediaGrid");
const summary = document.getElementById("summary");

function status(el, msg, error = false) {
  el.textContent = msg;
  el.className = "status" + (error ? " error" : "");
}

async function showSession() {
  const { data } = await supabaseClient.auth.getSession();
  if (data.session) {
    loginCard.classList.add("hidden");
    dashboard.classList.remove("hidden");
    await loadMedia();
  }
}

loginForm.addEventListener("submit", async e => {
  e.preventDefault();
  status(loginStatus, "Signing in...");
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    status(loginStatus, "Invalid login details or the account has not been confirmed.", true);
    return;
  }
  loginForm.reset();
  await showSession();
});

document.getElementById("logoutBtn").onclick = async () => {
  await supabaseClient.auth.signOut();
  dashboard.classList.add("hidden");
  loginCard.classList.remove("hidden");
  mediaGrid.innerHTML = "";
};

document.getElementById("refreshBtn").onclick = loadMedia;

async function loadMedia() {
  status(adminStatus, "Loading files...");
  const { data, error } = await supabaseClient
    .from(TABLE)
    .select("id, guest_name, file_path, file_type, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    status(adminStatus, "Could not load the files. Please check your admin permissions.", true);
    return;
  }

  summary.textContent = `Total files: ${data.length}`;
  mediaGrid.innerHTML = "";

  if (!data.length) {
    status(adminStatus, "No photos or videos yet.");
    return;
  }

  status(adminStatus, "");

  for (const item of data) {
    const { data: signed, error: urlError } = await supabaseClient.storage
      .from(BUCKET)
      .createSignedUrl(item.file_path, 3600);

    if (urlError) continue;

    const card = document.createElement("article");
    card.className = "media-item";
    const date = new Date(item.created_at).toLocaleString("ar-EG");

    const media = item.file_type === "image"
      ? `<img src="${signed.signedUrl}" alt="صورة من ${escapeHtml(item.guest_name)}" loading="lazy">`
      : `<video src="${signed.signedUrl}" controls playsinline preload="metadata"></video>`;

    card.innerHTML = `
      <div class="media-box">${media}</div>
      <div class="media-info">
        <strong>${escapeHtml(item.guest_name)}</strong>
        <small>${item.file_type === "image" ? "📸 صورة" : "🎥 فيديو"} — ${date}</small>
        <button class="delete-btn" type="button">حذف</button>
      </div>
    `;

    card.querySelector(".delete-btn").onclick = () => deleteItem(item, card);
    mediaGrid.appendChild(card);
  }
}

async function deleteItem(item, card) {
  if (!confirm(`Delete the file from ${item.guest_name}?`)) return;

  const btn = card.querySelector(".delete-btn");
  btn.disabled = true;

  const { error: storageError } = await supabaseClient.storage
    .from(BUCKET)
    .remove([item.file_path]);

  if (storageError) {
    alert("Could not delete the file from storage.");
    btn.disabled = false;
    return;
  }

  const { error: dbError } = await supabaseClient
    .from(TABLE)
    .delete()
    .eq("id", item.id);

  if (dbError) {
    alert("The file was deleted, but its database record could not be deleted.");
    btn.disabled = false;
    return;
  }

  card.remove();
  summary.textContent = summary.textContent.replace(/\d+$/, n => Math.max(0, Number(n) - 1));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
  }[c]));
}

showSession();

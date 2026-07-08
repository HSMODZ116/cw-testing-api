var CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function j(data, status) {
  return new Response(JSON.stringify(data, null, 2), {
    status: status || 200,
    headers: Object.assign({ "Content-Type": "application/json" }, CORS_HEADERS),
  });
}

function safeStr(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  return null;
}

function safeNum(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    var n = Number(v);
    return isNaN(n) ? null : n;
  }
  return null;
}

function safeBool(v) {
  if (v === true || v === false) return v;
  if (typeof v === "string") return v === "true" || v === "1";
  return null;
}

function extractBraced(str, pos) {
  var depth = 0, inStr = false, esc = false, start = -1;
  for (var i = pos; i < str.length; i++) {
    var c = str[i];
    if (esc) { esc = false; continue; }
    if (c === '\\' && inStr) { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (!inStr) {
      if (c === '{') { if (start === -1) start = i; depth++; }
      else if (c === '}') { depth--; if (depth === 0 && start !== -1) return str.substring(start, i + 1); }
    }
  }
  return null;
}

function tryParse(raw) {
  try { return JSON.parse(raw); } catch (e) {}
  try {
    var c = raw.replace(/'/g, '"');
    c = c.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)(\s*:)/g, '$1"$2"$3');
    c = c.replace(/:\s*undefined/g, ':null');
    c = c.replace(/:\s*!1/g, ':false');
    c = c.replace(/:\s*!0/g, ':true');
    c = c.replace(/:\s*NaN/g, ':null');
    return JSON.parse(c);
  } catch (e) { return null; }
}

function extractPluginData(html) {
  var v2idx = html.indexOf('"PagePluginV2"');
  if (v2idx !== -1) {
    var objStart = html.indexOf('{', v2idx + 14);
    if (objStart !== -1) {
      var outer = extractBraced(html, objStart);
      if (outer) {
        var pidx = outer.indexOf('"props"');
        if (pidx !== -1) {
          var col = outer.indexOf(':', pidx + 7);
          if (col !== -1) {
            var vs = col + 1;
            while (vs < outer.length && outer[vs] === ' ') vs++;
            if (outer[vs] === '{') {
              var ps = extractBraced(outer, vs);
              if (ps) return tryParse(ps);
            }
          }
        }
        var um = outer.match(/(?:^|[{,])\s*props\s*:/);
        if (um) {
          var ustart = um.index + um[0].length;
          while (ustart < outer.length && outer[ustart] === ' ') ustart++;
          if (outer[ustart] === '{') {
            var ups = extractBraced(outer, ustart);
            if (ups) return tryParse(ups);
          }
        }
      }
    }
  }

  var idx = html.indexOf('"props":{');
  if (idx !== -1) {
    var ps = extractBraced(html, idx + 8);
    if (ps) return tryParse(ps);
  }

  var um2 = html.match(/(?:^|[{,])\s*props\s*:\s*\{/);
  if (um2) {
    var mstart = um2.index + um2[0].length - 1;
    var ps2 = extractBraced(html, mstart);
    if (ps2) return tryParse(ps2);
  }

  return null;
}

function extractOGMeta(html) {
  var meta = {};
  var regex = /<meta\s+(?:property|name)=["']([^"']+)["']\s+content=["']([^"']*)["']/gi;
  var m;
  while ((m = regex.exec(html)) !== null) {
    meta[m[1]] = m[2];
  }
  return meta;
}

function extractPageId(meta) {
  var url = meta["al:android:url"] || meta["al:ios:url"] || "";
  var m = url.match(/profile\/(\d+)/);
  return m ? m[1] : null;
}

function parseFollowerCount(str) {
  if (!str) return null;
  str = str.replace(/,/g, "").trim();
  var m = str.match(/^([\d.]+)([MKBT]?)/i);
  if (!m) return null;
  var num = parseFloat(m[1]);
  var suffix = m[2].toUpperCase();
  if (suffix === "M") num *= 1000000;
  else if (suffix === "K") num *= 1000;
  else if (suffix === "B") num *= 1000000000;
  else if (suffix === "T") num *= 1000000000000;
  return Math.round(num);
}

function parseLikesFromDesc(desc) {
  if (!desc) return { likes: null, talking_about: null };
  var likes = null, talking = null;
  var m1 = desc.match(/([\d,.]+)\s*(?:likes|like)/i);
  if (m1) likes = parseInt(m1[1].replace(/,/g, ""));
  var m2 = desc.match(/([\d,.]+)\s*(?:talking about this|talking about)/i);
  if (m2) talking = parseInt(m2[1].replace(/,/g, ""));
  return { likes, talking_about: talking };
}

function formatTime(ts) {
  if (!ts) return null;
  return new Date(ts * 1000).toISOString();
}

function xPost(p) {
  var type = "unknown";
  var at = (p.attachmentType || "").toLowerCase();
  if (at === "photo" || at === "album") type = at;
  else if (at === "video") type = "video";
  else if (at === "link") type = "link";
  else if (at === "share") type = "share";
  else if (at === "event") type = "event";
  else if (at === "music") type = "music";

  var photos = null;
  if (p.albumPhotoURLs && Array.isArray(p.albumPhotoURLs) && p.albumPhotoURLs.length > 0) {
    photos = p.albumPhotoURLs.map(function(url) {
      return { url: url, width: p.photoWidth || null, height: p.photoHeight || null };
    });
  } else if (p.photoURL) {
    photos = [{ url: p.photoURL, width: p.photoWidth || null, height: p.photoHeight || null }];
  }

  return {
    message: p.message || null,
    created_time: p.createdTime || null,
    created_time_iso: formatTime(p.createdTime),
    type: type,
    photos: photos,
    photo_count: p.albumPhotoCount || (p.photoURL ? 1 : null),
    video_duration_ms: p.videoDurationMs || null,
    link_title: p.linkTitle || null,
    link_domain: p.linkDomain || null,
    attached_story: p.attachedStory || null,
    reactions: p.reactionCount || null,
    comments: p.commentCount || null,
    shares: p.shareCount || null,
  };
}

async function handleRequest(request) {
  var url = new URL(request.url);
  var path = url.pathname;

  if (request.method === "OPTIONS") {
    return new Response("", { status: 204, headers: CORS_HEADERS });
  }

  if (path === "/" || path === "") {
    return j({
      service: "Facebook Page Scraper v1.0",
      note: "Zero config. Copy, Paste, Deploy.",
      endpoints: {
        "/info?page=<username>": "Full page info with timeline posts",
      },
    });
  }

  if (path === "/info") {
    var pageName = url.searchParams.get("page");
    var postsLimit = parseInt(url.searchParams.get("posts")) || 10;

    if (!pageName) {
      return j({ error: "missing_page", message: "Provide ?page=<username> (e.g., ?page=GoogleIndia)" }, 400);
    }

    pageName = pageName.trim();
    if (pageName.startsWith("https://") || pageName.startsWith("http://")) {
      var m = pageName.match(/facebook\.com\/([^\/?#]+)/);
      if (m) pageName = m[1];
    }
    pageName = pageName.replace(/^\//, "");

    var pageUrl = "https://www.facebook.com/" + encodeURIComponent(pageName);

    try {
      var pluginUrl = "https://www.facebook.com/plugins/page.php?href=" +
        encodeURIComponent(pageUrl) + "&tabs=timeline&width=500&height=700";

      var pluginResp = await fetch(pluginUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept": "text/html,application/xhtml+xml",
        },
      });

      var pluginHtml = await pluginResp.text();
      var pluginData = extractPluginData(pluginHtml);

      if (!pluginData) {
        var mainResp = await fetch(pageUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
          },
        });
        var mainHtml = await mainResp.text();
        var ogMeta = extractOGMeta(mainHtml);

        return j({
          error: "parse_failed",
          message: "Could not parse page plugin data. Try a different page name.",
          meta: ogMeta,
        }, 422);
      }

      var descStats = parseLikesFromDesc(pluginData.pageDescription || "");

      var profile = {
        id: pluginData.pageID || extractPageId({}) || null,
        name: pluginData.pageName || null,
        username: pageName,
        url: pageUrl,
        page_url: pluginData.pageURL || null,
        description: pluginData.pageDescription || null,
        category: pluginData.pageCategory || null,
        followers: pluginData.followerCountFormatted || null,
        followers_raw: parseFollowerCount(pluginData.followerCountFormatted),
        likes: descStats.likes,
        talking_about: descStats.talking_about,
        verified: safeBool(pluginData.isVerified),
        profile_pic: pluginData.profilePicURL || null,
        cover_photo: pluginData.coverPhotoURL || null,
        price_range: pluginData.pagePriceRange || null,
        phone: pluginData.pagePhone || null,
        instagram: pluginData.pageInstagram || null,
        website: null,
      };

      var posts = [];
      if (pluginData.timelinePosts && Array.isArray(pluginData.timelinePosts)) {
        var sliced = pluginData.timelinePosts.slice(0, postsLimit);
        posts = sliced.map(xPost);
      }

      return j({
        success: true,
        profile: profile,
        posts: posts,
        posts_fetched: posts.length,
        posts_total: pluginData.timelinePosts ? pluginData.timelinePosts.length : 0,
        fetched_at: new Date().toISOString(),
      });

    } catch (e) {
      return j({ error: "fetch_failed", message: e.message }, 500);
    }
  }

  return j({ error: "not_found", message: "Endpoint not found. Use /info?page=<username>" }, 404);
}

addEventListener("fetch", function(event) {
  event.respondWith(handleRequest(event.request));
});
// src by @ftgamer2 🐱‍👤

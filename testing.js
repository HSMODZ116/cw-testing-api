const ALLOWED_DOMAINS = ['www.facebook.com', 'm.facebook.com', 'facebook.com'];
const REQUEST_TIMEOUT = 30000;
const MAX_RETRIES = 2;

const startTime = Date.now();

class FacebookProfileScraper {
  constructor() {
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'max-age=0',
      'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
      'Dnt': '1'
    };
  }

  validateUrl(url) {
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return false;
      }
      if (!ALLOWED_DOMAINS.includes(parsed.hostname)) {
        return false;
      }
      if (/[<>"']/.test(url)) {
        return false;
      }
      return true;
    } catch (e) {
      console.error('URL validation error:', e);
      return false;
    }
  }

  async initializeSession() {
    try {
      const response = await fetch('https://www.facebook.com/', {
        headers: this.headers,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT)
      });
      return response.ok;
    } catch (e) {
      console.error('Session initialization error:', e);
      return false;
    }
  }

  async normalizeProfileUrl(url) {
    if (!this.validateUrl(url)) {
      return null;
    }

    if (url.includes('/share/')) {
      try {
        const response = await fetch(url, {
          headers: this.headers,
          redirect: 'follow',
          signal: AbortSignal.timeout(REQUEST_TIMEOUT)
        });
        url = response.url;
      } catch (e) {
        console.error('Failed to resolve share link:', e);
        return null;
      }
    }

    if (url.includes('m.facebook.com')) {
      url = url.replace('m.facebook.com', 'www.facebook.com');
    } else if (url.includes('facebook.com') && !url.includes('www.')) {
      url = url.replace('facebook.com', 'www.facebook.com');
    }

    const parsed = new URL(url);
    if (!ALLOWED_DOMAINS.includes(parsed.hostname)) {
      return null;
    }

    return url;
  }

  isValidImageUrl(url) {
    if (!url || typeof url !== 'string') {
      return false;
    }

    if (url.length > 2000) {
      return false;
    }

    const invalidExtensions = ['.js', '.css', '.ico', '.json', '.xml', '.txt', '.html'];
    for (const ext of invalidExtensions) {
      if (url.toLowerCase().endsWith(ext)) {
        return false;
      }
    }

    if (url.includes('/rsrc.php/') && !/(\.jpg|\.png|\.webp|\.jpeg|image)/i.test(url)) {
      return false;
    }

    const imageIndicators = [
      '.jpg', '.jpeg', '.png', '.webp', '.gif',
      'photo', 'picture', 'image', '/t39.', '/t1.',
      'fbcdn.net', 'scontent'
    ];

    return imageIndicators.some(indicator => url.toLowerCase().includes(indicator));
  }

  cleanUrl(url) {
    url = url.replace(/&amp;/g, '&');
    url = url.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    url = url.replace(/&quot;/g, '"');
    url = url.replace(/&#039;/g, "'");
    url = url.replace(/\\\//g, '/');
    url = url.replace(/\\"/g, '"');
    url = url.replace(/\\u0025/g, '%');
    url = url.replace(/\\u002F/g, '/');
    return url.trim();
  }

  sanitizeUrl(url) {
    url = this.cleanUrl(url);
    url = url.split('"')[0].split("'")[0].split('>')[0].split('<')[0];
    url = url.split('\\')[0];
    url = url.split(' ')[0];
    return url.trim();
  }

  async getProfilePage(profileUrl) {
    try {
      const normalizedUrl = await this.normalizeProfileUrl(profileUrl);
      if (!normalizedUrl) {
        return null;
      }

      const headers = {
        ...this.headers,
        'Referer': 'https://www.facebook.com/'
      };

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          const response = await fetch(normalizedUrl, {
            headers: headers,
            redirect: 'follow',
            signal: AbortSignal.timeout(REQUEST_TIMEOUT)
          });

          if (response.ok) {
            return await response.text();
          } else if (response.status === 429) {
            console.warn(`Rate limited on attempt ${attempt + 1}`);
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
          } else {
            console.error(`HTTP ${response.status} on attempt ${attempt + 1}`);
          }
        } catch (e) {
          console.error(`Timeout on attempt ${attempt + 1}:`, e);
          if (attempt < MAX_RETRIES - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }

      return null;
    } catch (e) {
      console.error('Error fetching profile page:', e);
      return null;
    }
  }

  getImageSizeScore(url) {
    const sizePatterns = [
      /s(\d+)x(\d+)/,
      /p(\d+)x(\d+)/,
      /ctp=s(\d+)x(\d+)/
    ];

    for (const pattern of sizePatterns) {
      const match = url.match(pattern);
      if (match) {
        return parseInt(match[1]);
      }
    }

    if (url.includes('s40x40') || url.includes('cp0_dst')) {
      return 40;
    }
    if (url.includes('s160x160')) {
      return 160;
    }
    if (url.includes('s320x320')) {
      return 320;
    }
    if (url.includes('s480x480')) {
      return 480;
    }
    if (url.includes('s720x720')) {
      return 720;
    }
    if (url.includes('s960x960')) {
      return 960;
    }

    // Base URLs without query params get LOWEST score
    // so parameterized versions with explicit sizes are preferred
    if (!url.includes('?') || !url.includes('stp=')) {
      return 0;
    }

    return 500;
  }

  extractImageId(url) {
    const idMatch = url.match(/\/(\d+)_(\d+)_(\d+)_[on]\.jpg/);
    if (idMatch) {
      return idMatch[2];
    }
    return null;
  }

  extractAllUrls(html) {
    const urls = new Set();

    const imgSrcPattern = /<img[^>]+src=["']([^"']+)["']/gi;
    const imgMatches = html.matchAll(imgSrcPattern);
    for (const match of imgMatches) {
      let url = match[1];
      url = this.sanitizeUrl(url);
      if (url && url.startsWith('http') && this.isValidImageUrl(url) && url.length < 2000) {
        urls.add(url);
      }
    }

    const fbcdnPatterns = [
      /https:\/\/scontent[^\s"'<>\\]+\.fbcdn\.net[^\s"'<>\\]+\.(?:jpg|jpeg|png|webp)[^\s"'<>\\]*/gi,
      /"(https:\/\/scontent[^"]+\.fbcdn\.net[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/gi,
    ];

    for (const pattern of fbcdnPatterns) {
      const matches = html.matchAll(pattern);
      for (const match of matches) {
        let url = typeof match === 'string' ? match : (match[1] || match[0]);
        url = this.sanitizeUrl(url);
        
        if (url && url.startsWith('http') && this.isValidImageUrl(url) && url.length < 2000 && url.includes('fbcdn.net')) {
          urls.add(url);
          
          if (url.includes('?')) {
            const baseUrl = url.split('?')[0];
            if (baseUrl.length > 50) {
              urls.add(baseUrl);
            }
          }
        }
      }
    }

    return Array.from(urls);
  }

  extractImageUrls(htmlContent) {
    const images = {
      profile_picture: null,
      profile_picture_hd: null,
      cover_photo: null,
      cover_photo_hd: null,
      photo_images: [],
      all_images: new Set()
    };

    const extractedUrls = this.extractAllUrls(htmlContent);
    
    console.log(`Extracted ${extractedUrls.length} total URLs`);

    for (const url of extractedUrls) {
      images.all_images.add(url);
    }

    const profileVariants = {};
    const coverVariants = {};
    const photoCandidates = [];

    for (const imgUrl of images.all_images) {
      const imgId = this.extractImageId(imgUrl);

      const isProfileType = imgUrl.includes('/t39.30808-1/') || imgUrl.includes('3ab345') || imgUrl.includes('1d2534');
      const isCoverType = imgUrl.includes('/t39.30808-6/');

      const sizeScore = this.getImageSizeScore(imgUrl);

      if (isProfileType && imgId) {
        if (!profileVariants[imgId]) {
          profileVariants[imgId] = [];
        }
        profileVariants[imgId].push([sizeScore, imgUrl]);
      }

      if (isCoverType && imgId) {
        if (!coverVariants[imgId]) {
          coverVariants[imgId] = [];
        }
        coverVariants[imgId].push([sizeScore, imgUrl]);
      }

      if (isCoverType && sizeScore >= 320) {
        photoCandidates.push([sizeScore, imgUrl]);
      }
    }

    console.log(`Profile variants: ${Object.keys(profileVariants).length}`);
    console.log(`Cover variants: ${Object.keys(coverVariants).length}`);

    // Profile picture - like Python: find largest ID, then highest size score
    if (Object.keys(profileVariants).length > 0) {
      const largestProfileId = Object.keys(profileVariants).reduce((a, b) => {
        const maxA = Math.max(...profileVariants[a].map(v => v[0]));
        const maxB = Math.max(...profileVariants[b].map(v => v[0]));
        return maxB > maxA ? b : a;
      });

      const profileVersions = profileVariants[largestProfileId].sort((a, b) => b[0] - a[0]);

      images.profile_picture_hd = profileVersions[0][1];
      images.profile_picture = profileVersions[0][1];
    }

    // Cover photo - like Python: find largest ID, then highest size score
    if (Object.keys(coverVariants).length > 0) {
      const largestCoverId = Object.keys(coverVariants).reduce((a, b) => {
        const maxA = Math.max(...coverVariants[a].map(v => v[0]));
        const maxB = Math.max(...coverVariants[b].map(v => v[0]));
        return maxB > maxA ? b : a;
      });

      const coverVersions = coverVariants[largestCoverId].sort((a, b) => b[0] - a[0]);

      images.cover_photo_hd = coverVersions[0][1];
      images.cover_photo = coverVersions[0][1];
    }

    // Photos array - sort by size score descending, deduplicate by ID
    photoCandidates.sort((a, b) => b[0] - a[0]);
    const seenIds = new Set();
    const uniquePhotos = [];

    for (const [score, url] of photoCandidates) {
      const imgId = this.extractImageId(url);
      if (imgId && !seenIds.has(imgId)) {
        seenIds.add(imgId);
        uniquePhotos.push(url);
        if (uniquePhotos.length >= 10) {
          break;
        }
      }
    }

    images.photo_images = uniquePhotos;
    images.all_images = Array.from(images.all_images);

    return images;
  }

  async scrapeProfile(profileUrl) {
    if (!this.validateUrl(profileUrl)) {
      console.error('Invalid URL provided:', profileUrl);
      return null;
    }

    if (!(await this.initializeSession())) {
      console.log('Session initialization failed, continuing anyway...');
    }

    const htmlContent = await this.getProfilePage(profileUrl);

    if (!htmlContent) {
      console.error('Failed to fetch HTML content');
      return null;
    }

    console.log(`HTML content length: ${htmlContent.length} bytes`);

    const images = this.extractImageUrls(htmlContent);

    return images;
  }
}

function getUptime() {
  const uptimeMs = Date.now() - startTime;
  const seconds = Math.floor(uptimeMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  } else if (minutes > 0) {
    return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
  } else {
    return `0:00:${String(seconds).padStart(2, '0')}`;
  }
}

async function handleRequest(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    });
  }

  if (pathname === '/' || pathname === '') {
    const welcomeData = {
      message: "Facebook Profile Scraper API",
      description: "Extract profile pictures, cover photos, and other images from Facebook profiles",
      warning: "This tool is for educational purposes only. Scraping Facebook may violate their Terms of Service.",
      endpoint: "/api/all",
      usage: "/api/all?url=https://www.facebook.com/username",
      parameters: {
        url: "Facebook profile URL (required)"
      },
      example: "/api/all?url=https://www.facebook.com/share/1BsGawqkh/",
      developer: "@ISmartCoder",
      channel: "t.me/TheSmartDev",
      version: "3.2.0",
      uptime: getUptime()
    };

    return new Response(JSON.stringify(welcomeData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }

  if (pathname === '/api/all') {
    const requestStart = Date.now();
    const profileUrl = url.searchParams.get('url')?.trim() || '';

    if (!profileUrl) {
      const errorData = {
        error: "No URL provided",
        message: "Please provide a Facebook profile URL using ?url=parameter",
        example: "/api/all?url=https://www.facebook.com/username",
        developer: "@ISmartCoder",
        channel: "t.me/TheSmartDev",
        time_taken: `${((Date.now() - requestStart) / 1000).toFixed(2)}s`
      };

      return new Response(JSON.stringify(errorData, null, 2), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    if (!profileUrl.includes('facebook.com')) {
      const errorData = {
        error: "Invalid URL",
        message: "Please provide a valid Facebook profile URL",
        developer: "@ISmartCoder",
        channel: "t.me/TheSmartDev",
        time_taken: `${((Date.now() - requestStart) / 1000).toFixed(2)}s`
      };

      return new Response(JSON.stringify(errorData, null, 2), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    console.log('Processing all images request:', profileUrl);

    try {
      const scraper = new FacebookProfileScraper();
      const result = await scraper.scrapeProfile(profileUrl);

      if (result) {
        const responseData = {
          success: true,
          profile_picture: {
            standard: result.profile_picture,
            hd: result.profile_picture_hd
          },
          cover_photo: {
            standard: result.cover_photo,
            hd: result.cover_photo_hd
          },
          photos: result.photo_images,
          all_images: result.all_images,
          total_count: result.all_images.length,
          developer: "@ISmartCoder",
          channel: "t.me/TheSmartDev",
          time_taken: `${((Date.now() - requestStart) / 1000).toFixed(2)}s`,
          api_uptime: getUptime()
        };

        return new Response(JSON.stringify(responseData, null, 2), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      } else {
        const errorData = {
          error: "Failed to scrape profile",
          message: "Could not extract data from the provided URL",
          developer: "@ISmartCoder",
          channel: "t.me/TheSmartDev",
          time_taken: `${((Date.now() - requestStart) / 1000).toFixed(2)}s`
        };

        return new Response(JSON.stringify(errorData, null, 2), {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
    } catch (e) {
      console.error('Error processing request:', e);
      const errorData = {
        error: "Processing failed",
        message: "Unable to process the request",
        details: e.message,
        developer: "@ISmartCoder",
        channel: "t.me/TheSmartDev",
        time_taken: `${((Date.now() - requestStart) / 1000).toFixed(2)}s`
      };

      return new Response(JSON.stringify(errorData, null, 2), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }
  }

  return new Response('Not Found', {
    status: 404,
    headers: corsHeaders
  });
}

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request);
  }
};
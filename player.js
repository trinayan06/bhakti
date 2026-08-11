/**
 * Bhakti - Devotional Music Stream
 * Hidden YouTube IFrame Player Engine with Fixed Opening Sequence & Dynamic Continuous Playlist Rotation
 */

(function () {
  'use strict';

  // --- Configuration ---
  const fixedOpeningTracks = [
    'Yuex2EnsGiY', // 1st song
    'kYFriF5zHMM', // 2nd song
    '6bIFN4QobuM', // Bagad Bam — Kailash Kher
    '9tb2s_HhpwA', // Hanuman Chalisa — Gulshan Kumar & Hariharan
    'J69f5_PyEuY', // sakal hans
    '4DkNCgUXbig', // parvati boli shankar
  ];

  const bigPlaylists = [
    'PL9bw4S5ePsEE0jGfUgUMvzeWAaMPcqHL9&si', // zubeen nutial Top Bhajan
    'PLM3TSQaW_spO3Ys9tQOlgHdQdY7eGflFu', // Top All God's Non Stop - Bhajans, Aarti, Mantra, Stotram
    'PLFwWLQlofbIlOZ0fANFpGoSRcV_ZFNqBy', // Bhajan India All Time Popular Bhajans | Mantras | Aarti
    'PLBh0UuZ31iHCVmT9S65cKMKIWSOeeDEvE', // Aarti Bhajan collection
    'PLmg7X7Fh8K2rxqywyc9KqWs0wJ-8IWPHI', // Ganesh Aarti & Bhajans
  ];

  // --- Cross-Session Resume Utilities ---
  function getResumeState() {
    try {
      const raw = localStorage.getItem('bhakti_resume');
      if (!raw) return null;
      const state = JSON.parse(raw);
      if (!state || !state.videoId) return null;
      const dayMs = 24 * 60 * 60 * 1000;
      if (Date.now() - state.savedAt > 7 * dayMs) return null; // ignore if older than a week
      return state;
    } catch (e) {
      return null;
    }
  }

  let lastSave = 0;
  function saveProgress(currentTime, force = false) {
    if (typeof currentTime !== 'number' || isNaN(currentTime) || currentTime < 0) return;
    const now = Date.now();
    if (!force && (now - lastSave < 5000)) return;
    lastSave = now;

    const vid = extractVideoId() || currentVideoId;
    if (!vid) return;

    try {
      localStorage.setItem('bhakti_resume', JSON.stringify({
        videoId: vid,
        time: Math.floor(currentTime),
        isOpeningPhase: isOpeningPhase,
        openingTrackIndex: openingTrackIndex,
        currentPlaylistIndex: currentPlaylistIndex,
        savedAt: now,
      }));
    } catch (e) { }
  }

  // --- State Variables ---
  const savedState = getResumeState();
  let player = null;
  let playerReady = false;
  let hasInteracted = false;
  let hasStartedResumedPlayback = false;
  let isOpeningPhase = true;
  let openingTrackIndex = 0;
  let currentPlaylistIndex = 0;
  let currentVideoId = fixedOpeningTracks[0];

  if (savedState) {
    currentVideoId = savedState.videoId;
    if (savedState.isOpeningPhase !== undefined) {
      isOpeningPhase = savedState.isOpeningPhase;
      openingTrackIndex = savedState.openingTrackIndex || 0;
    } else {
      const idx = fixedOpeningTracks.indexOf(savedState.videoId);
      if (idx !== -1) {
        isOpeningPhase = true;
        openingTrackIndex = idx;
      } else {
        isOpeningPhase = false;
      }
    }
    if (savedState.currentPlaylistIndex !== undefined) {
      currentPlaylistIndex = savedState.currentPlaylistIndex;
    }
  }

  let isPlaying = false;
  let progressInterval = null;
  let isDragging = false;
  let seekTargetSeconds = 0;

  // --- DOM Elements ---
  const tapHintEl = document.getElementById('tap-hint');
  const liveClockEl = document.getElementById('live-clock');
  const onlineCounterEl = document.getElementById('online-counter');
  const trackArtworkEl = document.querySelector('.track-artwork');
  const trackThumbEl = document.getElementById('track-thumb');
  const trackTitleEl = document.getElementById('track-title');
  const trackArtistEl = document.getElementById('track-artist');
  const progressContainer = document.getElementById('progress-container');
  const progressTrack = document.getElementById('progress-track');
  const progressFillEl = document.getElementById('progress-fill');
  const progressThumbEl = document.getElementById('progress-thumb');
  const timeElapsedEl = document.getElementById('time-elapsed');
  const timeDurationEl = document.getElementById('time-duration');
  const btnPlayPause = document.getElementById('btn-play-pause');
  const iconPlay = document.getElementById('icon-play');
  const iconPause = document.getElementById('icon-pause');
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  const btnBell = document.getElementById('btn-bell');
  const btnFlower = document.getElementById('btn-flower');

  // --- 1. Live Clock Utility ---
  function updateClock() {
    const now = new Date();
    let hours = now.getHours();
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const formattedHours = hours.toString().padStart(2, '0');
    if (liveClockEl) {
      liveClockEl.textContent = `${formattedHours}:${minutes} ${ampm}`;
    }
  }
  updateClock();
  setInterval(updateClock, 1000);

  // --- 2. Real Live-Visitor Counter via Supabase Realtime Presence ---
  function updateOnlineCounter(count) {
    if (onlineCounterEl) {
      const validCount = typeof count === 'number' && count > 0 ? count : 1;
      onlineCounterEl.textContent = `${validCount} listening`;
    }
  }

  function initSupabasePresence() {
    if (!window.supabase || !window.supabase.createClient) {
      // If CDN script is still downloading, retry in a brief moment
      setTimeout(initSupabasePresence, 200);
      return;
    }

    try {
      const supabase = window.supabase.createClient(
        "https://zcsvichuejjuxnbspand.supabase.co",
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpjc3ZpY2h1ZWpqdXhuYnNwYW5kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0NDE4MDAsImV4cCI6MjEwMjAxNzgwMH0.5aZsbDHeHw_8UwBd_cepo78kd4Ya4ik7p5dplTwpE84"
      );

      const visitorId = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : 'visitor-' + Math.random().toString(36).substring(2, 15) + Date.now();

      const channel = supabase.channel("bhakti-online", {
        config: { presence: { key: visitorId } },
      });

      channel
        .on("presence", { event: "sync" }, () => {
          const state = channel.presenceState();
          const count = Object.keys(state).length;
          updateOnlineCounter(count);
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            await channel.track({ online_at: new Date().toISOString() });
          }
        });
    } catch (err) {
      console.warn('Supabase Realtime Presence initialization:', err);
    }
  }

  initSupabasePresence();

  // --- 3. Format Time Utility (Seconds -> M:SS) ---
  function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // --- 4. YouTube IFrame API Initialization ---
  function initYouTubeAPI() {
    if (window.YT && window.YT.Player) {
      createPlayer();
    } else {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    }
  }

  window.onYouTubeIframeAPIReady = function () {
    createPlayer();
  };

  function createPlayer() {
    if (player) return;
    const resume = getResumeState();
    const initialVid = resume && resume.videoId ? resume.videoId : fixedOpeningTracks[0];
    const startSec = resume && resume.time ? Math.floor(resume.time) : 0;

    player = new YT.Player('youtube-player', {
      height: '10',
      width: '10',
      videoId: initialVid,
      playerVars: {
        autoplay: 0,
        controls: 0,
        disablekb: 1,
        fs: 0,
        iv_load_policy: 3,
        modestbranding: 1,
        playsinline: 1,
        rel: 0,
        enablejsapi: 1,
        start: startSec,
      },
      events: {
        onReady: onPlayerReady,
        onStateChange: onPlayerStateChange,
        onError: onPlayerError,
      },
    });
  }

  // --- 5. Player Event Handlers ---
  function onPlayerReady(event) {
    playerReady = true;
    setInitialOpeningMetadata();

    // If user already clicked anywhere before player was ready, start playback
    if (hasInteracted) {
      startPlayback();
    }
  }

  function setInitialOpeningMetadata() {
    const resume = getResumeState();
    const vid = resume && resume.videoId ? resume.videoId : fixedOpeningTracks[0];
    currentVideoId = vid;
    if (trackThumbEl) {
      trackThumbEl.src = `https://img.youtube.com/vi/${vid}/hqdefault.jpg`;
    }
    checkAndUpdateTrackInfo();
  }

  function onPlayerStateChange(event) {
    const state = event.data;

    // YT.PlayerState: -1 (UNSTARTED), 0 (ENDED), 1 (PLAYING), 2 (PAUSED), 3 (BUFFERING), 5 (CUED)
    if (state === YT.PlayerState.PLAYING) {
      isPlaying = true;
      updatePlayPauseButton(true);
      startProgressTracking();
      checkAndUpdateTrackInfo();
      updateMediaSessionPositionState();
    } else if (state === YT.PlayerState.PAUSED) {
      isPlaying = false;
      updatePlayPauseButton(false);
      stopProgressTracking();
    } else if (state === YT.PlayerState.ENDED) {
      handleTrackEnded();
    } else if (state === YT.PlayerState.BUFFERING || state === YT.PlayerState.CUED) {
      checkAndUpdateTrackInfo();
    }
  }

  function onPlayerError(event) {
    console.warn('YouTube Player encountered an error, automatically skipping forward...', event.data);
    advanceToNextTrack();
  }

  // --- 6. Playback Transitions & Fixed Sequence / Playlist Rotation ---
  function playOpeningTrackAt(index) {
    isOpeningPhase = true;
    openingTrackIndex = index;
    const videoId = fixedOpeningTracks[openingTrackIndex];
    currentVideoId = videoId;

    if (player && player.loadVideoById) {
      player.loadVideoById(videoId);
      player.playVideo();
    }
  }

  function handleTrackEnded() {
    if (isOpeningPhase) {
      // Move to next song in fixed opening sequence
      openingTrackIndex++;
      if (openingTrackIndex < fixedOpeningTracks.length) {
        playOpeningTrackAt(openingTrackIndex);
      } else {
        // Finished all 4 fixed opening songs -> transition to playlist mode
        switchToPlaylistMode(0);
      }
    } else {
      // In playlist mode: check if at the end of the current playlist
      const playlist = player.getPlaylist();
      const currentIndex = player.getPlaylistIndex();

      if (playlist && Array.isArray(playlist) && currentIndex >= playlist.length - 1) {
        advanceToNextPlaylist();
      }
    }
  }

  function switchToPlaylistMode(playlistIdx) {
    isOpeningPhase = false;
    currentPlaylistIndex = playlistIdx % bigPlaylists.length;
    if (player && player.loadPlaylist) {
      player.loadPlaylist({
        list: bigPlaylists[currentPlaylistIndex],
        index: 0,
        listType: 'playlist',
      });
      player.playVideo();
    }
  }

  function advanceToNextPlaylist() {
    currentPlaylistIndex = (currentPlaylistIndex + 1) % bigPlaylists.length;
    switchToPlaylistMode(currentPlaylistIndex);
  }

  function advanceToNextTrack() {
    if (!playerReady || !player) return;

    if (isOpeningPhase) {
      openingTrackIndex++;
      if (openingTrackIndex < fixedOpeningTracks.length) {
        playOpeningTrackAt(openingTrackIndex);
      } else {
        // Finished all fixed opening songs -> switch to playlist mode
        switchToPlaylistMode(0);
      }
    } else {
      const playlist = player.getPlaylist();
      const currentIndex = player.getPlaylistIndex();

      if (playlist && Array.isArray(playlist) && currentIndex >= playlist.length - 1) {
        advanceToNextPlaylist();
      } else if (player.nextVideo) {
        player.nextVideo();
      }
    }
  }

  function handlePreviousTrack() {
    if (!playerReady || !player) return;

    if (isOpeningPhase) {
      if (openingTrackIndex > 0) {
        openingTrackIndex--;
        playOpeningTrackAt(openingTrackIndex);
      } else {
        if (player.seekTo) {
          player.seekTo(0, true);
          player.playVideo();
        }
      }
    } else {
      const currentIndex = player.getPlaylistIndex ? player.getPlaylistIndex() : 0;
      if (currentIndex > 0 && player.previousVideo) {
        player.previousVideo();
      } else if (currentPlaylistIndex > 0) {
        currentPlaylistIndex--;
        switchToPlaylistMode(currentPlaylistIndex);
      } else {
        // Return to last song in fixed opening sequence
        playOpeningTrackAt(fixedOpeningTracks.length - 1);
      }
    }
  }

  // --- 7. Track Information & oEmbed Fetcher ---
  function extractVideoId() {
    if (!player) return null;
    try {
      if (player.getVideoData && player.getVideoData().video_id) {
        return player.getVideoData().video_id;
      }
      if (player.getVideoUrl) {
        const url = player.getVideoUrl();
        const match = url.match(/[?&]v=([^&#]+)/);
        if (match) return match[1];
      }
    } catch (e) { }
    return null;
  }

  let lastFetchedId = '';
  function checkAndUpdateTrackInfo() {
    const videoId = extractVideoId() || currentVideoId;
    if (!videoId || videoId === lastFetchedId) return;
    lastFetchedId = videoId;
    currentVideoId = videoId;

    let preliminaryTitle = 'Devotional Bhajan';
    let preliminaryAuthor = 'Bhakti Stream';

    try {
      const data = player.getVideoData();
      if (data && data.title) {
        preliminaryTitle = data.title;
        preliminaryAuthor = data.author || 'Bhakti Stream';
        if (trackTitleEl) trackTitleEl.textContent = preliminaryTitle;
        if (trackArtistEl) trackArtistEl.textContent = preliminaryAuthor;
      }
    } catch (e) { }

    const thumbUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    if (trackThumbEl) {
      trackThumbEl.src = thumbUrl;
    }

    updateMediaSession(preliminaryTitle, preliminaryAuthor, thumbUrl);

    // Official CORS-enabled YouTube oEmbed endpoint
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    fetch(oembedUrl)
      .then((res) => {
        if (!res.ok) throw new Error('oEmbed request failed');
        return res.json();
      })
      .then((data) => {
        const finalTitle = data.title || preliminaryTitle;
        const finalAuthor = data.author_name || preliminaryAuthor;
        const finalThumb = data.thumbnail_url || thumbUrl;

        if (trackTitleEl && data.title) {
          trackTitleEl.textContent = data.title;
        }
        if (trackArtistEl && data.author_name) {
          trackArtistEl.textContent = data.author_name;
        }
        if (trackThumbEl && data.thumbnail_url) {
          trackThumbEl.src = data.thumbnail_url;
        }

        updateMediaSession(finalTitle, finalAuthor, finalThumb);
      })
      .catch(() => { });
  }

  // --- 8. Media Session API Support ---
  function updateMediaSession(title, artist, artworkUrl) {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: title || 'Bhakti Devotional Stream',
        artist: artist || 'Devotional Music',
        album: 'Bhakti',
        artwork: [
          { src: artworkUrl || 'baba.png', sizes: '512x512', type: 'image/jpeg' },
        ],
      });

      navigator.mediaSession.setActionHandler('play', togglePlayPause);
      navigator.mediaSession.setActionHandler('pause', togglePlayPause);
      navigator.mediaSession.setActionHandler('previoustrack', handlePreviousTrack);
      navigator.mediaSession.setActionHandler('nexttrack', advanceToNextTrack);
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime && player && player.seekTo) {
          player.seekTo(details.seekTime, true);
        }
      });
    }
  }

  function updateMediaSessionPositionState() {
    if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession && player) {
      try {
        const duration = player.getDuration ? player.getDuration() : 0;
        const currentTime = player.getCurrentTime ? player.getCurrentTime() : 0;
        if (duration > 0 && currentTime >= 0 && currentTime <= duration) {
          navigator.mediaSession.setPositionState({
            duration: duration,
            playbackRate: 1,
            position: currentTime,
          });
        }
      } catch (e) { }
    }
  }

  // --- 9. Interactive Draggable Progress Bar & Polling Loop ---
  function startProgressTracking() {
    stopProgressTracking();
    updateProgress();
    progressInterval = setInterval(updateProgress, 300);
  }

  function stopProgressTracking() {
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
  }

  function updateProgress() {
    if (isDragging || !playerReady || !player) return;

    try {
      const currentTime = player.getCurrentTime ? player.getCurrentTime() : 0;
      const duration = player.getDuration ? player.getDuration() : 0;

      if (currentTime > 0) {
        saveProgress(currentTime);
      }

      if (timeElapsedEl) {
        timeElapsedEl.textContent = formatTime(currentTime);
      }
      if (timeDurationEl && duration > 0) {
        timeDurationEl.textContent = formatTime(duration);
      }

      if (duration > 0) {
        const percentage = Math.min(100, Math.max(0, (currentTime / duration) * 100));
        if (progressFillEl) progressFillEl.style.width = `${percentage}%`;
        if (progressThumbEl) progressThumbEl.style.left = `${percentage}%`;
        if (progressContainer) progressContainer.setAttribute('aria-valuenow', Math.round(percentage));
      }
    } catch (e) { }
  }

  function getPercentageFromEvent(e) {
    if (!progressTrack) return 0;
    const rect = progressTrack.getBoundingClientRect();
    const clientX = e.touches && e.touches.length > 0 ? e.touches[0].clientX : (e.changedTouches && e.changedTouches.length > 0 ? e.changedTouches[0].clientX : e.clientX);
    const relativeX = clientX - rect.left;
    return Math.max(0, Math.min(1, relativeX / rect.width));
  }

  function updateDragPreview(percentage) {
    const duration = player && player.getDuration ? player.getDuration() : 0;
    seekTargetSeconds = percentage * duration;

    if (progressFillEl) progressFillEl.style.width = `${percentage * 100}%`;
    if (progressThumbEl) progressThumbEl.style.left = `${percentage * 100}%`;
    if (timeElapsedEl) timeElapsedEl.textContent = formatTime(seekTargetSeconds);
    if (progressContainer) progressContainer.setAttribute('aria-valuenow', Math.round(percentage * 100));
  }

  function handleScrubberStart(e) {
    if (!playerReady || !player) return;
    isDragging = true;
    if (progressContainer) progressContainer.classList.add('is-dragging');

    const percentage = getPercentageFromEvent(e);
    updateDragPreview(percentage);
  }

  function handleScrubberMove(e) {
    if (!isDragging) return;
    if (e.cancelable) e.preventDefault();
    const percentage = getPercentageFromEvent(e);
    updateDragPreview(percentage);
  }

  function handleScrubberEnd(e) {
    if (!isDragging) return;
    isDragging = false;
    if (progressContainer) progressContainer.classList.remove('is-dragging');

    if (player && player.seekTo) {
      player.seekTo(seekTargetSeconds, true);
      if (!isPlaying && player.playVideo) {
        player.playVideo();
      }
    }
  }

  // Bind Scrubber Events
  if (progressContainer) {
    progressContainer.addEventListener('mousedown', handleScrubberStart);
    progressContainer.addEventListener('touchstart', handleScrubberStart, { passive: false });
  }

  window.addEventListener('mousemove', handleScrubberMove);
  window.addEventListener('touchmove', handleScrubberMove, { passive: false });
  window.addEventListener('mouseup', handleScrubberEnd);
  window.addEventListener('touchend', handleScrubberEnd);

  // --- 10. UI Controls & Interactions ---
  function updatePlayPauseButton(playing) {
    if (trackArtworkEl) {
      if (playing) {
        trackArtworkEl.classList.add('is-playing');
      } else {
        trackArtworkEl.classList.remove('is-playing');
      }
    }

    if (playing) {
      if (iconPlay) iconPlay.classList.add('hidden');
      if (iconPause) iconPause.classList.remove('hidden');
      if (btnPlayPause) btnPlayPause.setAttribute('aria-label', 'Pause');
    } else {
      if (iconPlay) iconPlay.classList.remove('hidden');
      if (iconPause) iconPause.classList.add('hidden');
      if (btnPlayPause) btnPlayPause.setAttribute('aria-label', 'Play');
    }
  }

  function togglePlayPause() {
    if (!playerReady || !player) return;
    if (isPlaying) {
      player.pauseVideo();
    } else {
      player.playVideo();
    }
  }

  function startPlayback() {
    if (!player) return;
    const resume = getResumeState();
    if (resume && resume.videoId && !hasStartedResumedPlayback) {
      hasStartedResumedPlayback = true;
      if (player.loadVideoById) {
        player.loadVideoById({
          videoId: resume.videoId,
          startSeconds: resume.time || 0,
        });
      }
      if (player.playVideo) {
        player.playVideo();
      }
    } else if (player && player.playVideo) {
      player.playVideo();
    }
  }

  // --- 11. Subtle Global First-Interaction Listener (Autoplay Unblocker) ---
  function handleFirstGlobalInteraction(e) {
    if (hasInteracted) return;
    hasInteracted = true;

    if (tapHintEl) {
      tapHintEl.classList.add('faded-out');
      setTimeout(() => {
        if (tapHintEl && tapHintEl.parentNode) {
          tapHintEl.parentNode.removeChild(tapHintEl);
        }
      }, 1200);
    }

    if (playerReady) {
      startPlayback();
    }
  }

  // Attach global interaction listeners for first tap/click anywhere
  document.addEventListener('click', handleFirstGlobalInteraction, { once: true });
  document.addEventListener('touchstart', handleFirstGlobalInteraction, { once: true, passive: true });

  // Control button listeners
  if (btnPlayPause) {
    btnPlayPause.addEventListener('click', (e) => {
      e.stopPropagation();
      handleFirstGlobalInteraction();
      togglePlayPause();
    });
  }

  if (btnNext) {
    btnNext.addEventListener('click', (e) => {
      e.stopPropagation();
      handleFirstGlobalInteraction();
      advanceToNextTrack();
    });
  }

  if (btnPrev) {
    btnPrev.addEventListener('click', (e) => {
      e.stopPropagation();
      handleFirstGlobalInteraction();
      handlePreviousTrack();
    });
  }

  // Keyboard Shortcuts
  document.addEventListener('keydown', (e) => {
    if (!hasInteracted) {
      handleFirstGlobalInteraction();
    }

    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      togglePlayPause();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      advanceToNextTrack();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      handlePreviousTrack();
    }
  });

  // --- Cross-Session Page Lifecycle Progress Save Listeners ---
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && player && player.getCurrentTime) {
      saveProgress(player.getCurrentTime(), true);
    }
  });

  window.addEventListener('pagehide', () => {
    if (player && player.getCurrentTime) {
      saveProgress(player.getCurrentTime(), true);
    }
  });

  window.addEventListener('beforeunload', () => {
    if (player && player.getCurrentTime) {
      saveProgress(player.getCurrentTime(), true);
    }
  });

  // --- 12. Devotional Interactions (Temple Bell Audio & Flower Shower) ---
  const bellAudio = new Audio('sounds/baba3.mp3');
  bellAudio.preload = 'auto';

  function playBellSound() {
    try {
      bellAudio.currentTime = 0;
      const playPromise = bellAudio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          playSynthesizedBell();
        });
      }
    } catch (e) {
      playSynthesizedBell();
    }
  }

  function playSynthesizedBell() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      const now = ctx.currentTime;

      [660, 990, 1320, 1980].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.3 / (i + 1), now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 2.5);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 2.5);
      });
    } catch (e) {
      console.warn('Web Audio fallback error:', e);
    }
  }

  function triggerFlowerFall() {
    const container = document.getElementById('petal-layer');
    if (!container) return;
    const petalCount = 42;
    const flowers = ['🌸', '🌺', '🏵️', '🌼', '🪷'];

    for (let i = 0; i < petalCount; i++) {
      const petal = document.createElement('div');
      petal.className = 'petal';
      petal.textContent = flowers[Math.floor(Math.random() * flowers.length)];
      petal.style.left = (Math.random() * 96) + 'vw';
      petal.style.fontSize = (16 + Math.random() * 18) + 'px';
      const duration = 3 + Math.random() * 3;
      petal.style.animationDuration = duration + 's';
      petal.style.animationDelay = (Math.random() * 1.5) + 's';
      container.appendChild(petal);

      petal.addEventListener('animationend', () => {
        if (petal && petal.parentNode) {
          petal.parentNode.removeChild(petal);
        }
      });
    }
  }

  // Bell Button Listener
  if (btnBell) {
    btnBell.addEventListener('click', (e) => {
      e.stopPropagation();
      playBellSound();
      btnBell.classList.add('ringing');
      btnBell.classList.add('is-ringing');
      setTimeout(() => {
        btnBell.classList.remove('ringing');
        btnBell.classList.remove('is-ringing');
      }, 500);
    });
  }

  // Flower Shower Button Listener
  if (btnFlower) {
    btnFlower.addEventListener('click', (e) => {
      e.stopPropagation();
      triggerFlowerFall();
    });
  }

  // --- Start YouTube IFrame Loader ---
  initYouTubeAPI();
})();

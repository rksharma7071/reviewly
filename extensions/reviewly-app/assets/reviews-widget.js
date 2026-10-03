(function () {
    'use strict';

    const DEFAULT_APP_URL = '/apps/reviewly';

    function apiUrl(appUrl, path, params) {
        const base = (appUrl || DEFAULT_APP_URL).replace(/\/$/, '');
        const u = new URL(base + path, window.location.origin);
        Object.entries(params || {}).forEach(([k, v]) => u.searchParams.set(k, v));
        return u.toString();
    }

    const escapeHtml = (str) =>
        String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

    const fmtDate = (iso) => {
        try {
            return new Date(iso).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
            });
        } catch (_) {
            return '';
        }
    };

    const STARS = (rating) => {
        const r = Math.max(0, Math.min(5, Number(rating) || 0));
        let html = '<div class="rw-stars" role="img" aria-label="' + r + ' out of 5 stars">';
        for (let i = 1; i <= 5; i++) {
            const diff = r - i;
            if (diff >= 0) {
                html += '<span class="rw-star rw-star--full" aria-hidden="true">★</span>';
            } else if (diff > -1) {
                const pct = Math.round((1 + diff) * 100);
                html +=
                    '<span class="rw-star rw-star--half" aria-hidden="true">' +
                    '<span class="rw-star__bg">★</span>' +
                    '<span class="rw-star__fg" style="width:' + pct + '%">★</span>' +
                    '</span>';
            } else {
                html += '<span class="rw-star rw-star--empty" aria-hidden="true">★</span>';
            }
        }
        return html + '</div>';
    };

    async function fetchReviews({ appUrl, shop, productId, page, perPage, sort }) {
        const res = await fetch(
            apiUrl(appUrl, '/api/reviews', { shop, productId, page, perPage, sort }),
            { headers: { Accept: 'application/json' } }
        );
        if (!res.ok) throw new Error('Failed to load reviews (' + res.status + ')');
        return res.json();
    }

    async function uploadReviewMedia(file, appUrl) {
        const presign = await fetch(apiUrl(appUrl, '/api/uploads/presign'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                filename: file.name,
                contentType: file.type,
                size: file.size,
            }),
        });
        if (!presign.ok) {
            const e = await presign.json().catch(() => ({}));
            throw new Error(e.error || 'Could not prepare upload');
        }
        const p = await presign.json();

        const form = new FormData();
        form.append('file', file);
        form.append('api_key', p.apiKey);
        form.append('timestamp', String(p.timestamp));
        form.append('public_id', p.publicId);
        form.append('folder', p.folder);
        form.append('signature', p.signature);

        const upload = await fetch(p.uploadUrl, { method: 'POST', body: form });
        if (!upload.ok) throw new Error('Upload failed');
        const data = await upload.json();

        return {
            url: data.secure_url,
            type: p.resourceType === 'video' ? 'VIDEO' : 'IMAGE',
            publicId: data.public_id,
        };
    }

    function renderReview(r, showVerified) {
        const media = Array.isArray(r.media) ? r.media : [];
        const mediaHtml = media.length
            ? '<div class="rw-review__media">' +
              media
                  .filter((m) => m && m.url)
                  .map((m) => {
                      const safe = escapeHtml(m.url);
                      if (m.type === 'VIDEO') {
                          return '<video src="' + safe + '" controls preload="metadata" width="120" height="120"></video>';
                      }
                      return (
                          '<a href="' + safe + '" target="_blank" rel="noopener">' +
                          '<img src="' + safe + '" alt="Review media" loading="lazy"></a>'
                      );
                  })
                  .join('') +
              '</div>'
            : '';

        const verified =
            showVerified && r.verifiedPurchase
                ? '<span class="rw-review__badge">✔ Verified purchase</span>'
                : '';

        const reply = r.merchantReply
            ? '<div class="rw-review__reply"><strong>Store reply</strong>' +
              escapeHtml(r.merchantReply) + '</div>'
            : '';

        return (
            '<article class="rw-review">' +
            '<header class="rw-review__head">' +
            STARS(r.rating) +
            '<span class="rw-review__author">' + escapeHtml(r.authorName || 'Anonymous') + '</span>' +
            verified +
            '<span class="rw-review__date">' + fmtDate(r.publishedAt || r.createdAt) + '</span>' +
            '</header>' +
            (r.title ? '<h4 class="rw-review__title">' + escapeHtml(r.title) + '</h4>' : '') +
            '<p class="rw-review__body">' + escapeHtml(r.body) + '</p>' +
            mediaHtml +
            reply +
            '</article>'
        );
    }

    function renderPagination(container, page, totalPages, onGo) {
        container.innerHTML = '';
        if (totalPages <= 1) return;

        const makeBtn = (label, targetPage, opts = {}) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = label;
            if (opts.current) b.setAttribute('aria-current', 'page');
            if (opts.disabled) b.disabled = true;
            b.addEventListener('click', () => onGo(targetPage));
            return b;
        };
        const dots = () => {
            const d = document.createElement('span');
            d.textContent = '…';
            d.style.alignSelf = 'center';
            return d;
        };

        container.appendChild(makeBtn('‹', page - 1, { disabled: page <= 1 }));

        const win = 2;
        const start = Math.max(1, page - win);
        const end = Math.min(totalPages, page + win);

        if (start > 1) {
            container.appendChild(makeBtn('1', 1, { current: page === 1 }));
            if (start > 2) container.appendChild(dots());
        }
        for (let p = start; p <= end; p++) {
            container.appendChild(makeBtn(String(p), p, { current: p === page }));
        }
        if (end < totalPages) {
            if (end < totalPages - 1) container.appendChild(dots());
            container.appendChild(makeBtn(String(totalPages), totalPages, { current: page === totalPages }));
        }

        container.appendChild(makeBtn('›', page + 1, { disabled: page >= totalPages }));
    }

    function openWriteForm(root, ctx) {
        if (root.querySelector('.rw-form')) return;

        const { appUrl, shop, productId, anchorEl } = ctx;
        const form = document.createElement('form');
        form.className = 'rw-form';
        form.noValidate = false;
        form.innerHTML =
            '<h4 class="rw-form__title">Write a review</h4>' +
            '<div class="rw-form__stars" data-rw-star-input aria-label="Rating"></div>' +
            '<input name="authorName" placeholder="Your name" required maxlength="80">' +
            '<input name="authorEmail" type="email" placeholder="Email (used for the verified badge, never shown)">' +
            '<input name="title" placeholder="Review title" maxlength="120">' +
            '<textarea name="body" placeholder="Share your experience" required maxlength="5000" rows="4"></textarea>' +
            '<input type="file" name="files" accept="image/*,video/*" multiple data-rw-files>' +
            '<input name="website" tabindex="-1" autocomplete="off" aria-hidden="true" ' +
            'style="position:absolute;left:-9999px;opacity:0;height:0;width:0">' +
            '<div class="rw-form__msg" data-rw-msg role="status"></div>' +
            '<div class="rw-form__actions">' +
            '<button type="submit" class="button button--primary">Submit review</button>' +
            '<button type="button" class="button button--secondary" data-rw-cancel>Cancel</button>' +
            '</div>';

        let rating = 0;
        const starBox = form.querySelector('[data-rw-star-input]');
        for (let i = 1; i <= 5; i++) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'rw-star-btn';
            b.textContent = '★';
            b.setAttribute('aria-label', i + ' star' + (i > 1 ? 's' : ''));
            b.addEventListener('click', () => {
                rating = i;
                [...starBox.children].forEach((c, idx) => c.classList.toggle('is-on', idx < i));
            });
            starBox.appendChild(b);
        }

        form.querySelector('[data-rw-cancel]').addEventListener('click', () => form.remove());

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const msg = form.querySelector('[data-rw-msg]');
            const submitBtn = form.querySelector('button[type="submit"]');

            if (!rating) {
                msg.textContent = 'Please select a star rating.';
                return;
            }

            const files = [...form.querySelector('[data-rw-files]').files].slice(0, 5);
            submitBtn.disabled = true;
            msg.textContent = files.length ? 'Uploading media…' : 'Submitting…';

            try {
                const media = [];
                for (const f of files) media.push(await uploadReviewMedia(f, appUrl));

                const fd = new FormData(form);
                fd.delete('files');
                fd.set('shop', shop);
                fd.set('productId', productId);
                fd.set('rating', String(rating));
                if (media.length) fd.set('media', JSON.stringify(media));

                msg.textContent = 'Submitting…';
                const res = await fetch(apiUrl(appUrl, '/api/reviews'), {
                    method: 'POST',
                    body: fd,
                });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(json.error || 'Submission failed (' + res.status + ')');

                form.innerHTML =
                    '<p class="rw-form__done">' +
                    escapeHtml(json.message || 'Thanks! Your review is awaiting moderation.') +
                    '</p>';
            } catch (err) {
                console.error('[reviews-widget:submit]', err);
                msg.textContent = err.message || 'Something went wrong. Please try again.';
                submitBtn.disabled = false;
            }
        });

        anchorEl.insertAdjacentElement('beforebegin', form);
        form.querySelector('input[name="authorName"]').focus();
    }

    async function initWidget(root) {
        if (root.dataset.rwInit === '1') return;
        root.dataset.rwInit = '1';

        const appUrl = root.dataset.appUrl || DEFAULT_APP_URL;
        const shop = root.dataset.shop;
        const productId = root.dataset.productId;
        const perPage = parseInt(root.dataset.perPage || '5', 10);
        const showVerified = root.dataset.showVerified !== 'false';

        const listEl = root.querySelector('[data-rw-list]');
        const sortEl = root.querySelector('[data-rw-sort]');
        const pagEl = root.querySelector('[data-rw-pagination]');
        const summaryAverage = root.querySelector('[data-rw-average]');
        const summaryStars = root.querySelector('[data-rw-summary-stars]');
        const summaryCount = root.querySelector('[data-rw-count]');
        const writeBtn = root.querySelector('[data-rw-write]');

        let page = 1;
        let sort = 'recent';

        async function load() {
            listEl.innerHTML = '<div class="rw-loading">Loading reviews…</div>';
            try {
                const data = await fetchReviews({ appUrl, shop, productId, page, perPage, sort });

                const reviews = data.reviews || [];
                const total = data.total || 0;
                const average = data.average || 0;

                if (summaryAverage) summaryAverage.textContent = average.toFixed(1);
                if (summaryStars) summaryStars.innerHTML = STARS(average);
                if (summaryCount)
                    summaryCount.textContent = '(' + total + (total === 1 ? ' review' : ' reviews') + ')';

                const totalPages = Math.max(1, Math.ceil(total / perPage));

                if (!reviews.length) {
                    listEl.innerHTML = '<div class="rw-empty">No reviews yet. Be the first!</div>';
                    pagEl.innerHTML = '';
                    return;
                }

                listEl.innerHTML = reviews.map((r) => renderReview(r, showVerified)).join('');
                renderPagination(pagEl, page, totalPages, (p) => {
                    page = p;
                    load();
                    root.scrollIntoView({ behavior: 'smooth', block: 'start' });
                });
            } catch (err) {
                console.error('[reviews-widget]', err);
                listEl.innerHTML = '<div class="rw-empty">Unable to load reviews right now.</div>';
            }
        }

        if (sortEl) {
            sortEl.addEventListener('change', () => {
                sort = sortEl.value;
                page = 1;
                load();
            });
        }

        if (writeBtn) {
            writeBtn.addEventListener('click', () =>
                openWriteForm(root, { appUrl, shop, productId, anchorEl: writeBtn })
            );
        }

        load();
    }

    async function initInline(root) {
        if (root.dataset.rwInit === '1') return;
        root.dataset.rwInit = '1';

        const appUrl = root.dataset.appUrl || DEFAULT_APP_URL;
        const shop = root.dataset.shop;
        const productId = root.dataset.productId;
        const starsEl = root.querySelector('[data-rw-inline-stars]');
        const countEl = root.querySelector('[data-rw-inline-count]');

        try {
            const res = await fetch(apiUrl(appUrl, '/api/reviews/stats', { shop, productId }), {
                headers: { Accept: 'application/json' },
            });
            if (!res.ok) throw new Error(res.status);
            const { average = 0, count = 0 } = await res.json();

            if (starsEl) starsEl.innerHTML = STARS(average);
            if (countEl) countEl.textContent = '(' + count + (count === 1 ? ' review' : ' reviews') + ')';
        } catch (err) {
            console.warn('[reviews-widget:inline]', err);
        }
    }

    function boot(scope) {
        if (!window.ReviewlyAppEnabled) return;

        const widgets = (scope || document).querySelectorAll('.reviews-widget');
        widgets.forEach((el) => {
            el.style.display = '';
            initWidget(el);
        });

        const inlines = (scope || document).querySelectorAll('.rw-inline-rating');
        inlines.forEach((el) => {
            el.style.display = '';
            initInline(el);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => boot());
    } else {
        boot();
    }

    document.addEventListener('shopify:section:load', (e) => boot(e.target));
})();
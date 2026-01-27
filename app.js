/**
 * Sleeping Beauty Mechanism Viewer
 *
 * Static viewer for GitHub Pages deployment.
 * Uses CryptoJS for client-side decryption.
 */

// Global state
let casesData = [];
let metadata = [];
let lateAwakeningData = [];
let lateAwakeningCases = [];
let currentCaseIndex = -1;
let currentCaseSource = 'main'; // 'main' or 'late'
let storedPassword = null;

// ==================== Authentication ====================

async function submitPassword() {
    const password = document.getElementById('password-input').value;
    const errorEl = document.getElementById('password-error');

    if (!password) {
        errorEl.textContent = 'Please enter a password';
        return;
    }

    errorEl.textContent = 'Decrypting...';

    try {
        // Load encryption config
        const configResponse = await fetch('data/encryption_config.json');
        const config = await configResponse.json();

        // Load encrypted data
        const encryptedResponse = await fetch('data/cases.encrypted');
        const encrypted = await encryptedResponse.json();

        // Decrypt
        const decrypted = decryptData(encrypted, password, config);

        if (decrypted) {
            casesData = decrypted;
            storedPassword = password; // Store for late awakening decryption

            // Load metadata
            const metaResponse = await fetch('data/metadata.json');
            metadata = await metaResponse.json();

            // Hide modal, show app
            document.getElementById('password-modal').classList.add('hidden');
            document.getElementById('main-app').classList.remove('hidden');

            // Initialize the app
            initializeApp();
        } else {
            errorEl.textContent = 'Incorrect password. Please try again.';
        }
    } catch (error) {
        console.error('Decryption error:', error);
        errorEl.textContent = 'Error loading data. Please check the console.';
    }
}

function decryptData(encrypted, password, config) {
    try {
        // Convert base64 to WordArray
        const ciphertext = CryptoJS.enc.Base64.parse(encrypted.ciphertext);
        const iv = CryptoJS.enc.Base64.parse(encrypted.iv);
        const salt = CryptoJS.enc.Base64.parse(encrypted.salt);

        // Derive key using PBKDF2
        const key = CryptoJS.PBKDF2(password, salt, {
            keySize: config.keySize / 32,
            iterations: config.iterations,
            hasher: CryptoJS.algo.SHA256
        });

        // Decrypt
        const decrypted = CryptoJS.AES.decrypt(
            { ciphertext: ciphertext },
            key,
            { iv: iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }
        );

        // Convert to string and parse JSON
        const decryptedStr = decrypted.toString(CryptoJS.enc.Utf8);
        return JSON.parse(decryptedStr);
    } catch (error) {
        console.error('Decryption failed:', error);
        return null;
    }
}

// Allow Enter key to submit password
document.getElementById('password-input')?.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        submitPassword();
    }
});

// ==================== App Initialization ====================

async function initializeApp() {
    initializeTabs();
    renderOverview();
    populateCaseSelector();
    await loadLateAwakeningData();
}

// ==================== Late Awakening (3-Year Window) Tab ====================

async function loadLateAwakeningData() {
    try {
        // Load summary data for table
        const response = await fetch('data/late_awakening_top20.json');
        lateAwakeningData = await response.json();

        // Try to load and decrypt detailed case data
        try {
            const configResponse = await fetch('data/encryption_config.json');
            const config = await configResponse.json();

            const encryptedResponse = await fetch('data/late_awakening_cases.encrypted');
            const encrypted = await encryptedResponse.json();

            const decrypted = decryptData(encrypted, storedPassword, config);
            if (decrypted) {
                lateAwakeningCases = decrypted;
                console.log(`Loaded ${lateAwakeningCases.length} late awakening cases`);
                populateLateCaseSelector();
            }
        } catch (e) {
            console.log('Late awakening case data not available yet');
        }

        renderLateAwakeningTable();
    } catch (error) {
        console.error('Error loading late awakening data:', error);
    }
}

function renderLateAwakeningTable() {
    const tbody = document.querySelector('#late-awakening-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    lateAwakeningData.forEach((item, index) => {
        const row = document.createElement('tr');

        // Determine if this was "invisible" in 1-year (rank > 1000 or very low B)
        const isInvisible = item.rank_1yr > 1000 || item.B_1yr < 1;
        const rank1yrDisplay = item.rank_1yr ?
            (isInvisible ? `<span class="invisible-badge">${item.rank_1yr}</span>` : item.rank_1yr) :
            'N/A';
        const b1yrDisplay = item.B_1yr !== null ?
            (item.B_1yr < 1 ? `<span class="invisible-badge">${item.B_1yr.toFixed(1)}</span>` : item.B_1yr.toFixed(1)) :
            'N/A';

        // Check if detailed case data is available
        const hasDetailedData = lateAwakeningCases.length > index;
        const viewButton = hasDetailedData
            ? `<button onclick="viewLateAwakeningCase(${index})">View</button>`
            : `<span class="no-data-badge">Pending</span>`;

        row.innerHTML = `
            <td><strong>${item.rank_3yr}</strong></td>
            <td>${rank1yrDisplay}</td>
            <td class="title-cell">${escapeHtml(item.title)}</td>
            <td><strong>${item.B_3yr.toFixed(1)}</strong></td>
            <td>${b1yrDisplay}</td>
            <td>${item.sleep_duration}</td>
            <td>${item.tm}</td>
            <td><span class="category-badge ${item.category.toLowerCase()}">${item.category}</span></td>
            <td>${viewButton}</td>
        `;
        tbody.appendChild(row);
    });
}

function viewLateAwakeningCase(index) {
    if (index >= lateAwakeningCases.length) {
        alert('Detailed case data not available yet.');
        return;
    }

    // Switch to cases tab
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector('[data-tab="cases"]').classList.add('active');
    document.getElementById('cases').classList.add('active');

    // Render late awakening case
    currentCaseSource = 'late';
    currentCaseIndex = index;
    renderCaseFromData(lateAwakeningCases[index]);
}

function renderCaseFromData(c) {
    const container = document.getElementById('case-detail');

    // Calculate peak period
    const peakStart = c.tm - 7;
    const peakEnd = c.tm + 7;
    const createdDate = new Date(c.created_date);

    // Badge for late awakening
    const lateAwakeningBadge = c.is_late_awakening
        ? `<span class="late-awakening-badge">LATE AWAKENING (${c.sleep_duration}d sleep)</span>`
        : '';

    let html = `
        <div class="case-header">
            <div class="case-meta">
                <span class="rank-badge">#${c.rank} (3yr)</span>
                <span class="b-value">B: ${c.B.toFixed(1)}</span>
                <span class="peak-day">Peak: Day ${c.tm}</span>
                <span class="category-tag">${c.category}</span>
                ${lateAwakeningBadge}
            </div>
            <h2>${escapeHtml(c.title)}</h2>
        </div>

        <div class="mechanism-section">
            <h3>Mechanism Status</h3>
            <div class="mechanism-card n/a">
                <div class="mechanism-name">${c.mechanism}</div>
                <div class="mechanism-confidence">Confidence: ${c.confidence}</div>
                <div class="mechanism-evidence">${escapeHtml(c.evidence)}</div>
            </div>
        </div>

        <div class="timeline-section">
            <h3>Daily Views Timeline (3-Year Window)</h3>
            <canvas id="timeline-chart"></canvas>
        </div>
    `;

    // Original Post
    if (c.main_post) {
        const superuserBadge = c.main_post.is_superuser ? '<span class="superuser-badge">SUPERUSER</span>' : '';
        html += `
            <details class="content-section" open>
                <summary>Original Post</summary>
                <div class="post-content">
                    <div class="post-meta">Author: User ${c.main_post.author_id} ${superuserBadge} | ${c.main_post.date}</div>
                    <div class="post-body">${escapeHtml(c.main_post.body).replace(/\n/g, '<br>')}</div>
                </div>
            </details>
        `;
    }

    // Comments
    if (c.comments && c.comments.length > 0) {
        html += `
            <details class="content-section">
                <summary>Comments (${c.comments.length})</summary>
                <div class="comments-list">
        `;

        c.comments.forEach(comment => {
            const commentDate = new Date(comment.date);
            const dayNum = Math.floor((commentDate - createdDate) / (1000 * 60 * 60 * 24));
            const isPeak = dayNum >= peakStart && dayNum <= peakEnd;
            const peakClass = isPeak ? 'peak-comment' : '';
            const peakBadge = isPeak ? '<span class="peak-badge">PEAK</span>' : '';

            html += `
                <div class="comment-box ${peakClass}">
                    <div class="comment-header">
                        Day ${dayNum} | User ${comment.user_id} ${peakBadge}
                    </div>
                    <div class="comment-body">${escapeHtml(comment.body).replace(/\n/g, '<br>')}</div>
                </div>
            `;
        });

        html += `</div></details>`;
    }

    // Note about mechanism analysis
    if (c.is_late_awakening) {
        html += `
            <div class="info-box">
                <h4>Note</h4>
                <p>This is a late-awakening Sleeping Beauty from the 3-year window analysis.
                Mechanism analysis is pending. The post remained dormant for ${c.sleep_duration} days
                before awakening at day ${c.tm}.</p>
            </div>
        `;
    }

    container.innerHTML = html;

    // Render timeline chart
    renderTimelineChart(c.daily_views, c.tm);
}

// ==================== 3-Year Case Browser Tab ====================

let currentLateCaseIndex = -1;

function populateLateCaseSelector() {
    const selector = document.getElementById('late-case-selector');
    if (!selector) return;

    lateAwakeningCases.forEach((c, i) => {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = `#${c.rank} (3yr) - ${c.title.substring(0, 50)}...`;
        selector.appendChild(option);
    });

    selector.addEventListener('change', () => {
        const idx = parseInt(selector.value);
        if (!isNaN(idx)) {
            renderLateCaseInTab(idx);
        }
    });
}

function prevLateCase() {
    if (currentLateCaseIndex > 0) {
        document.getElementById('late-case-selector').value = currentLateCaseIndex - 1;
        renderLateCaseInTab(currentLateCaseIndex - 1);
    }
}

function nextLateCase() {
    if (currentLateCaseIndex < lateAwakeningCases.length - 1) {
        document.getElementById('late-case-selector').value = currentLateCaseIndex + 1;
        renderLateCaseInTab(currentLateCaseIndex + 1);
    }
}

function renderLateCaseInTab(index) {
    currentLateCaseIndex = index;
    const c = lateAwakeningCases[index];
    const container = document.getElementById('late-case-detail');

    // Calculate peak period
    const peakStart = c.tm - 7;
    const peakEnd = c.tm + 7;
    const createdDate = new Date(c.created_date);

    // Badge for late awakening
    const lateAwakeningBadge = `<span class="late-awakening-badge">LATE AWAKENING (${c.sleep_duration}d sleep)</span>`;

    let html = `
        <div class="case-header">
            <div class="case-meta">
                <span class="rank-badge">#${c.rank} (3yr)</span>
                <span class="b-value">B: ${c.B.toFixed(1)}</span>
                <span class="peak-day">Peak: Day ${c.tm}</span>
                <span class="category-tag">${c.category}</span>
                ${lateAwakeningBadge}
            </div>
            <h2>${escapeHtml(c.title)}</h2>
        </div>

        <div class="mechanism-section">
            <h3>Mechanism Status</h3>
            <div class="mechanism-card n/a">
                <div class="mechanism-name">${c.mechanism}</div>
                <div class="mechanism-confidence">Confidence: ${c.confidence}</div>
                <div class="mechanism-evidence">${escapeHtml(c.evidence)}</div>
            </div>
        </div>

        <div class="timeline-section">
            <h3>Daily Views Timeline (3-Year Window)</h3>
            <canvas id="late-timeline-chart"></canvas>
        </div>
    `;

    // Original Post
    if (c.main_post) {
        const superuserBadge = c.main_post.is_superuser ? '<span class="superuser-badge">SUPERUSER</span>' : '';
        html += `
            <details class="content-section" open>
                <summary>Original Post</summary>
                <div class="post-content">
                    <div class="post-meta">Author: User ${c.main_post.author_id} ${superuserBadge} | ${c.main_post.date}</div>
                    <div class="post-body">${escapeHtml(c.main_post.body).replace(/\n/g, '<br>')}</div>
                </div>
            </details>
        `;
    }

    // Comments
    if (c.comments && c.comments.length > 0) {
        html += `
            <details class="content-section">
                <summary>Comments (${c.comments.length})</summary>
                <div class="comments-list">
        `;

        c.comments.forEach(comment => {
            const commentDate = new Date(comment.date);
            const dayNum = Math.floor((commentDate - createdDate) / (1000 * 60 * 60 * 24));
            const isPeak = dayNum >= peakStart && dayNum <= peakEnd;
            const peakClass = isPeak ? 'peak-comment' : '';
            const peakBadge = isPeak ? '<span class="peak-badge">PEAK</span>' : '';

            html += `
                <div class="comment-box ${peakClass}">
                    <div class="comment-header">
                        Day ${dayNum} | User ${comment.user_id} ${peakBadge}
                    </div>
                    <div class="comment-body">${escapeHtml(comment.body).replace(/\n/g, '<br>')}</div>
                </div>
            `;
        });

        html += `</div></details>`;
    }

    // Note about mechanism analysis
    html += `
        <div class="info-box">
            <h4>Note</h4>
            <p>This is a late-awakening Sleeping Beauty from the 3-year window analysis.
            Mechanism analysis is pending. The post remained dormant for ${c.sleep_duration} days
            before awakening at day ${c.tm}.</p>
        </div>
    `;

    container.innerHTML = html;

    // Render timeline chart with different canvas ID
    renderTimelineChart(c.daily_views, c.tm, 'late-timeline-chart');
}

function initializeTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active from all
            tabBtns.forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

            // Add active to clicked
            btn.classList.add('active');
            document.getElementById(btn.dataset.tab).classList.add('active');
        });
    });
}

// ==================== Overview Tab ====================

function renderOverview() {
    // Stats
    document.getElementById('total-cases').textContent = metadata.length;

    const avgB = (metadata.reduce((sum, c) => sum + c.B, 0) / metadata.length).toFixed(1);
    document.getElementById('avg-beauty').textContent = avgB;

    const avgPeak = Math.round(metadata.reduce((sum, c) => sum + c.tm, 0) / metadata.length);
    document.getElementById('avg-peak').textContent = avgPeak;

    const withPrince = metadata.filter(c => c.has_prince).length;
    document.getElementById('with-prince').textContent = withPrince;

    // Charts
    renderMechanismChart();
    renderCategoryChart();

    // Table
    renderOverviewTable();
}

function renderMechanismChart() {
    const mechanismCounts = {};
    metadata.forEach(c => {
        const mech = c.mechanism.split(' (')[0]; // Remove (Possible) suffix
        mechanismCounts[mech] = (mechanismCounts[mech] || 0) + 1;
    });

    new Chart(document.getElementById('mechanism-chart'), {
        type: 'doughnut',
        data: {
            labels: Object.keys(mechanismCounts),
            datasets: [{
                data: Object.values(mechanismCounts),
                backgroundColor: [
                    '#4472C4', '#ED7D31', '#A5A5A5', '#FFC000',
                    '#5B9BD5', '#70AD47', '#9E480E', '#997300'
                ]
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'right' }
            }
        }
    });
}

function renderCategoryChart() {
    const categoryCounts = {};
    metadata.forEach(c => {
        categoryCounts[c.category] = (categoryCounts[c.category] || 0) + 1;
    });

    new Chart(document.getElementById('category-chart'), {
        type: 'bar',
        data: {
            labels: Object.keys(categoryCounts),
            datasets: [{
                label: 'Cases',
                data: Object.values(categoryCounts),
                backgroundColor: '#4472C4'
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } }
        }
    });
}

function renderOverviewTable() {
    const tbody = document.querySelector('#overview-table tbody');
    tbody.innerHTML = '';

    metadata.forEach(c => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${c.rank}</td>
            <td class="title-cell">${escapeHtml(c.title)}</td>
            <td>${c.B.toFixed(1)}</td>
            <td>${c.tm}</td>
            <td>${c.category}</td>
            <td><span class="mechanism-badge">${c.mechanism}</span></td>
            <td><button onclick="viewCase(${c.rank - 1})">View</button></td>
        `;
        tbody.appendChild(row);
    });
}

// ==================== Case Browser Tab ====================

function populateCaseSelector() {
    const selector = document.getElementById('case-selector');
    casesData.forEach((c, i) => {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = `#${c.rank} - ${c.title.substring(0, 50)}...`;
        selector.appendChild(option);
    });

    selector.addEventListener('change', () => {
        const idx = parseInt(selector.value);
        if (!isNaN(idx)) {
            renderCase(idx);
        }
    });
}

function viewCase(index) {
    // Switch to cases tab
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector('[data-tab="cases"]').classList.add('active');
    document.getElementById('cases').classList.add('active');

    // Render case
    document.getElementById('case-selector').value = index;
    renderCase(index);
}

function prevCase() {
    if (currentCaseIndex > 0) {
        document.getElementById('case-selector').value = currentCaseIndex - 1;
        renderCase(currentCaseIndex - 1);
    }
}

function nextCase() {
    if (currentCaseIndex < casesData.length - 1) {
        document.getElementById('case-selector').value = currentCaseIndex + 1;
        renderCase(currentCaseIndex + 1);
    }
}

function renderCase(index) {
    currentCaseIndex = index;
    const c = casesData[index];
    const container = document.getElementById('case-detail');

    // Calculate peak period
    const peakStart = c.tm - 7;
    const peakEnd = c.tm + 7;
    const createdDate = new Date(c.created_date);

    let html = `
        <div class="case-header">
            <div class="case-meta">
                <span class="rank-badge">#${c.rank}</span>
                <span class="b-value">B: ${c.B.toFixed(1)}</span>
                <span class="peak-day">Peak: Day ${c.tm}</span>
                <span class="category-tag">${c.category}</span>
            </div>
            <h2>${escapeHtml(c.title)}</h2>
        </div>

        <div class="mechanism-section">
            <h3>AI-Inferred Mechanism</h3>
            <div class="mechanism-card ${c.confidence.toLowerCase()}">
                <div class="mechanism-name">${c.mechanism}</div>
                <div class="mechanism-confidence">Confidence: ${c.confidence}</div>
                <div class="mechanism-evidence">${escapeHtml(c.evidence)}</div>
            </div>
            ${renderMechanismChain(c)}
        </div>

        <div class="timeline-section">
            <h3>Daily Views Timeline</h3>
            <canvas id="timeline-chart"></canvas>
        </div>
    `;

    // Original Post
    if (c.main_post) {
        const superuserBadge = c.main_post.is_superuser ? '<span class="superuser-badge">SUPERUSER</span>' : '';
        html += `
            <details class="content-section" open>
                <summary>Original Post</summary>
                <div class="post-content">
                    <div class="post-meta">Author: User ${c.main_post.author_id} ${superuserBadge} | ${c.main_post.date}</div>
                    <div class="post-body">${escapeHtml(c.main_post.body).replace(/\n/g, '<br>')}</div>
                </div>
            </details>
        `;
    }

    // Comments
    if (c.comments && c.comments.length > 0) {
        html += `
            <details class="content-section">
                <summary>Comments (${c.comments.length})</summary>
                <div class="comments-list">
        `;

        c.comments.forEach(comment => {
            const commentDate = new Date(comment.date);
            const dayNum = Math.floor((commentDate - createdDate) / (1000 * 60 * 60 * 24));
            const isPeak = dayNum >= peakStart && dayNum <= peakEnd;
            const peakClass = isPeak ? 'peak-comment' : '';
            const peakBadge = isPeak ? '<span class="peak-badge">PEAK</span>' : '';

            html += `
                <div class="comment-box ${peakClass}">
                    <div class="comment-header">
                        Day ${dayNum} | User ${comment.user_id} ${peakBadge}
                    </div>
                    <div class="comment-body">${escapeHtml(comment.body).replace(/\n/g, '<br>')}</div>
                </div>
            `;
        });

        html += `</div></details>`;
    }

    // Prince Post
    if (c.prince_post) {
        // Check if this is Author Self-Promotion - find the author's comment on this prince post
        const isAuthorSelfPromo = c.mechanism && c.mechanism.includes('Author Self-Promotion');
        const princePostId = c.prince_post.post_id;

        // Find author's comment on this specific prince post thread
        const authorCommentsElsewhere = c.exploration?.author_comments_elsewhere || [];
        const relatedComment = authorCommentsElsewhere.find(comment =>
            comment.thread_id === princePostId ||
            (comment.comment_body && (
                comment.comment_body.toLowerCase().includes('healthunlocked.com') ||
                comment.comment_body.includes(String(c.post_id))
            ))
        );

        const princeSuperuserBadge = c.prince_post.is_superuser ? '<span class="superuser-badge">SUPERUSER</span>' : '';
        html += `
            <details class="content-section" open>
                <summary>Prince Post (Awakening Trigger)</summary>
                <div class="prince-post">
                    <div class="prince-meta">Author: User ${c.prince_post.author_id} ${princeSuperuserBadge} | ${c.prince_post.date || ''}</div>
                    <div class="prince-title">${escapeHtml(c.prince_post.title)}</div>
                    <div class="prince-body">${escapeHtml(c.prince_post.body).replace(/\n/g, '<br>')}</div>
                </div>
        `;

        // Show author's comment if this is self-promotion
        if (relatedComment) {
            const commentBody = relatedComment.comment_body || '';
            const hasLink = commentBody.toLowerCase().includes('healthunlocked.com') ||
                           commentBody.includes(String(c.post_id));
            html += `
                <div class="self-promo-evidence">
                    <h4>Author's Comment on This Thread ${hasLink ? '<span class="link-badge">CONTAINS LINK TO SB POST</span>' : ''}</h4>
                    <div class="comment-box self-promo-card">
                        <div class="comment-body">${escapeHtml(commentBody).replace(/\n/g, '<br>')}</div>
                    </div>
                </div>
            `;
        }

        html += `</details>`;
    }

    // Awakening Analysis
    html += renderAwakeningAnalysis(c.exploration, c.post_id);

    // Giscus Comments Section
    html += `
        <div class="giscus-section">
            <h3>Research Notes & Discussion</h3>
            <p class="giscus-desc">Share your observations about this case with colleagues</p>
            <div class="giscus"></div>
        </div>
    `;

    container.innerHTML = html;

    // Render timeline chart
    renderTimelineChart(c.daily_views, c.tm);

    // Load Giscus for this case
    loadGiscus(c.post_id);
}

function renderAwakeningAnalysis(exploration, postId) {
    let html = `
        <details class="content-section" open>
            <summary>Awakening Analysis</summary>
            <div class="exploration-content">
    `;

    // 1a. Author's posts
    const authorPosts = exploration.author_posts || [];
    html += `
        <div class="exploration-section">
            <h4>1a. Same Author's Posts (${authorPosts.length} found)</h4>
            <p class="section-desc">Other posts by the same author around the awakening period</p>
    `;

    if (authorPosts.length > 0) {
        authorPosts.forEach(p => {
            const timing = p.days_from_peak < 0 ? 'before peak' : 'after peak';
            html += `
                <div class="related-post">
                    <div class="related-header">Post ${p.post_id} | ${Math.abs(p.days_from_peak)} days ${timing} | ${p.responses} responses</div>
                    <div class="related-title">${escapeHtml(p.title)}</div>
                    ${p.body_preview ? `<div class="related-preview">${escapeHtml(p.body_preview)}...</div>` : ''}
                </div>
            `;
        });
    } else {
        html += `<p class="no-data">No other posts by this author found</p>`;
    }
    html += `</div>`;

    // 1b. Author's Comments Elsewhere (Self-Promotion Detection)
    const authorCommentsElsewhere = exploration.author_comments_elsewhere || [];
    html += `
        <div class="exploration-section">
            <h4>1b. Author's Comments Elsewhere (${authorCommentsElsewhere.length} found)</h4>
            <p class="section-desc">Author's comments on OTHER threads around peak - potential self-promotion</p>
    `;

    if (authorCommentsElsewhere.length > 0) {
        authorCommentsElsewhere.slice(0, 10).forEach(c => {
            const commentBody = c.comment_body || '';
            // Check if comment contains link to the SB post
            const hasLink = commentBody.toLowerCase().includes('healthunlocked.com') ||
                           (postId && commentBody.includes(String(postId)));
            const linkBadge = hasLink ? '<span class="link-badge">CONTAINS LINK</span>' : '';
            const cardClass = hasLink ? 'self-promo-card' : '';
            const timing = c.days_from_peak < 0 ? 'before peak' : 'after peak';

            html += `
                <div class="comment-box ${cardClass}">
                    <div class="comment-header">
                        On: "${escapeHtml(c.thread_title)}" (by User ${c.thread_author}) | ${Math.abs(c.days_from_peak)} days ${timing} ${linkBadge}
                    </div>
                    <div class="comment-body">${escapeHtml(commentBody).replace(/\n/g, '<br>')}</div>
                </div>
            `;
        });
        if (authorCommentsElsewhere.length > 10) {
            html += `<p class="more-items">... and ${authorCommentsElsewhere.length - 10} more comments</p>`;
        }
    } else {
        html += `<p class="no-data">No comments on other threads found</p>`;
    }
    html += `</div>`;

    // 2. Peak Commenters
    const peakCommenters = exploration.peak_commenters || [];
    html += `
        <div class="exploration-section">
            <h4>2. New Peak Commenters (${peakCommenters.length} found)</h4>
            <p class="section-desc">Users who commented during awakening but NOT in early period</p>
    `;

    if (peakCommenters.length > 0) {
        peakCommenters.forEach(c => {
            html += `
                <div class="comment-box peak-comment">
                    <div class="comment-header">User ${c.user_id} | Day ${c.comment_day}</div>
                    <div class="comment-body">${escapeHtml(c.comment_preview || '')}</div>
                </div>
            `;
        });
    } else {
        html += `<p class="no-data">No new peak commenters found</p>`;
    }
    html += `</div>`;

    // 3. Where did they come from
    const commenterActivity = exploration.commenter_activity || [];
    html += `
        <div class="exploration-section">
            <h4>3. Where Did They Come From? (${commenterActivity.length} traced)</h4>
            <p class="section-desc">Activity of new commenters in 14 days BEFORE commenting on SB</p>
    `;

    if (commenterActivity.length > 0) {
        commenterActivity.forEach(activity => {
            html += `<div class="user-activity">`;
            html += `<h5>User ${activity.user_id}</h5>`;
            html += `<div class="activity-columns">`;

            // Posts created
            html += `<div class="activity-col">`;
            html += `<strong>Posts Created (${activity.posts_created?.length || 0})</strong>`;
            if (activity.posts_created && activity.posts_created.length > 0) {
                activity.posts_created.forEach(p => {
                    html += `
                        <div class="created-post">
                            <div class="created-title">${escapeHtml(p.title)}</div>
                            <div class="created-meta">${p.days_before_sb_comment} days before commenting on SB</div>
                            ${p.body_preview ? `<div class="created-preview">${escapeHtml(p.body_preview)}...</div>` : ''}
                        </div>
                    `;
                });
            } else {
                html += `<p class="no-data">No posts created</p>`;
            }
            html += `</div>`;

            // Threads participated
            html += `<div class="activity-col">`;
            html += `<strong>Threads Participated (${activity.threads_participated?.length || 0})</strong>`;
            if (activity.threads_participated && activity.threads_participated.length > 0) {
                activity.threads_participated.forEach(t => {
                    html += `
                        <div class="participated-thread">
                            <div class="thread-title">${escapeHtml(t.title)}</div>
                            <div class="thread-meta">Thread by User ${t.thread_author}</div>
                            ${t.comment_preview ? `<div class="thread-comment">"${escapeHtml(t.comment_preview)}"</div>` : ''}
                        </div>
                    `;
                });
            } else {
                html += `<p class="no-data">No thread participation found</p>`;
            }
            html += `</div>`;

            html += `</div>`; // activity-columns

            if ((!activity.posts_created || activity.posts_created.length === 0) &&
                (!activity.threads_participated || activity.threads_participated.length === 0)) {
                html += `<p class="warning-text">No prior activity found - user likely discovered via search or external link</p>`;
            }

            html += `</div>`; // user-activity
        });
    } else {
        html += `<p class="no-data">No commenter activity traced</p>`;
    }
    html += `</div>`;

    html += `</div></details>`;
    return html;
}

function renderTimelineChart(dailyViews, peakDay, canvasId = 'timeline-chart') {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: dailyViews.map(d => d.post_age_days),
            datasets: [{
                label: 'Daily Views',
                data: dailyViews.map(d => d.daily_views),
                borderColor: '#4472C4',
                backgroundColor: 'rgba(68, 114, 196, 0.1)',
                fill: true,
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                annotation: {
                    annotations: {
                        peakLine: {
                            type: 'line',
                            xMin: peakDay,
                            xMax: peakDay,
                            borderColor: 'red',
                            borderWidth: 2,
                            borderDash: [5, 5],
                            label: {
                                content: `Peak (Day ${peakDay})`,
                                enabled: true
                            }
                        }
                    }
                }
            },
            scales: {
                x: { title: { display: true, text: 'Days since post creation' } },
                y: { title: { display: true, text: 'Views' } }
            }
        }
    });
}

// ==================== Mechanism Chain ====================

function renderMechanismChain(c) {
    // Only show chain for certain mechanisms
    const mechanism = c.mechanism || '';

    // Case #5: External Event + Contextual Discovery
    if (mechanism.includes('External Event') && mechanism.includes('Contextual Discovery')) {
        return `
            <div class="mechanism-chain">
                <h4>Awakening Chain</h4>
                <div class="chain-container">
                    <div class="chain-step external-event">
                        <div class="step-icon">1</div>
                        <div class="step-content">
                            <div class="step-title">External Event</div>
                            <div class="step-desc">COVID Second Wave + UK Vaccine Rollout (Feb 2021)</div>
                        </div>
                    </div>
                    <div class="chain-arrow">&#8595;</div>
                    <div class="chain-step">
                        <div class="step-icon">2</div>
                        <div class="step-content">
                            <div class="step-title">Community Activity Spike</div>
                            <div class="step-desc">Multiple new posts about COVID/vaccine/shielding</div>
                        </div>
                    </div>
                    <div class="chain-arrow">&#8595;</div>
                    <div class="chain-step">
                        <div class="step-icon">3</div>
                        <div class="step-content">
                            <div class="step-title">Related Content Browsing</div>
                            <div class="step-desc">Users browse new COVID posts, platform shows related content</div>
                        </div>
                    </div>
                    <div class="chain-arrow">&#8595;</div>
                    <div class="chain-step discovery">
                        <div class="step-icon">4</div>
                        <div class="step-content">
                            <div class="step-title">Old Post Discovery</div>
                            <div class="step-desc">Users find SB post via internal navigation (NOT email)</div>
                        </div>
                    </div>
                    <div class="chain-arrow">&#8595;</div>
                    <div class="chain-step peak">
                        <div class="step-icon">5</div>
                        <div class="step-content">
                            <div class="step-title">Peak Engagement</div>
                            <div class="step-desc">New user comments, sharing experiential knowledge</div>
                        </div>
                    </div>
                </div>
                <div class="chain-insight">
                    <strong>Key Insight:</strong> Platform email notifications only promote NEW posts (98.2% within 7 days).
                    Old posts are discovered through internal navigation / related content browsing.
                </div>
            </div>
        `;
    }

    // Author Series Continuation
    if (mechanism.includes('Author Series Continuation') && !mechanism.includes('Possible')) {
        return `
            <div class="mechanism-chain">
                <h4>Awakening Chain</h4>
                <div class="chain-container">
                    <div class="chain-step">
                        <div class="step-icon">1</div>
                        <div class="step-content">
                            <div class="step-title">Original Post Created</div>
                            <div class="step-desc">Author creates educational content</div>
                        </div>
                    </div>
                    <div class="chain-arrow">&#8595;</div>
                    <div class="chain-step dormancy">
                        <div class="step-icon">2</div>
                        <div class="step-content">
                            <div class="step-title">Dormancy Period</div>
                            <div class="step-desc">Post receives minimal attention</div>
                        </div>
                    </div>
                    <div class="chain-arrow">&#8595;</div>
                    <div class="chain-step prince">
                        <div class="step-icon">3</div>
                        <div class="step-content">
                            <div class="step-title">Follow-up Post (Prince)</div>
                            <div class="step-desc">Same author publishes continuation/sequel</div>
                        </div>
                    </div>
                    <div class="chain-arrow">&#8595;</div>
                    <div class="chain-step peak">
                        <div class="step-icon">4</div>
                        <div class="step-content">
                            <div class="step-title">Peak - Discovery</div>
                            <div class="step-desc">Readers of new post discover original</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // Author Self-Promotion
    if (mechanism.includes('Author Self-Promotion')) {
        return `
            <div class="mechanism-chain">
                <h4>Awakening Chain</h4>
                <div class="chain-container">
                    <div class="chain-step">
                        <div class="step-icon">1</div>
                        <div class="step-content">
                            <div class="step-title">Original Post Created</div>
                            <div class="step-desc">Author creates educational content</div>
                        </div>
                    </div>
                    <div class="chain-arrow">&#8595;</div>
                    <div class="chain-step dormancy">
                        <div class="step-icon">2</div>
                        <div class="step-content">
                            <div class="step-title">Dormancy Period</div>
                            <div class="step-desc">Post receives minimal attention</div>
                        </div>
                    </div>
                    <div class="chain-arrow">&#8595;</div>
                    <div class="chain-step prince">
                        <div class="step-icon">3</div>
                        <div class="step-content">
                            <div class="step-title">Related Discussion (Prince)</div>
                            <div class="step-desc">Another user posts on related topic</div>
                        </div>
                    </div>
                    <div class="chain-arrow">&#8595;</div>
                    <div class="chain-step self-promo">
                        <div class="step-icon">4</div>
                        <div class="step-content">
                            <div class="step-title">Author Comments with Link</div>
                            <div class="step-desc">Original author replies with link to their post</div>
                        </div>
                    </div>
                    <div class="chain-arrow">&#8595;</div>
                    <div class="chain-step peak">
                        <div class="step-icon">5</div>
                        <div class="step-content">
                            <div class="step-title">Peak - Referral Traffic</div>
                            <div class="step-desc">Readers follow link to original post</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // New User Discovery
    if (mechanism === 'New User Discovery') {
        return `
            <div class="mechanism-chain">
                <h4>Awakening Chain</h4>
                <div class="chain-container">
                    <div class="chain-step">
                        <div class="step-icon">1</div>
                        <div class="step-content">
                            <div class="step-title">Original Post Created</div>
                            <div class="step-desc">User seeks help/shares experience</div>
                        </div>
                    </div>
                    <div class="chain-arrow">&#8595;</div>
                    <div class="chain-step dormancy">
                        <div class="step-icon">2</div>
                        <div class="step-content">
                            <div class="step-title">Dormancy Period</div>
                            <div class="step-desc">Post receives minimal attention</div>
                        </div>
                    </div>
                    <div class="chain-arrow">&#8595;</div>
                    <div class="chain-step discovery">
                        <div class="step-icon">3</div>
                        <div class="step-content">
                            <div class="step-title">New User Discovers Post</div>
                            <div class="step-desc">Via search, related posts, or browsing</div>
                        </div>
                    </div>
                    <div class="chain-arrow">&#8595;</div>
                    <div class="chain-step peak">
                        <div class="step-icon">4</div>
                        <div class="step-content">
                            <div class="step-title">Peak - Re-engagement</div>
                            <div class="step-desc">New user comments, may trigger original participants</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    return ''; // No chain for other mechanisms
}

// ==================== Utilities ====================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function loadGiscus(postId) {
    // Remove existing giscus iframe if any
    const giscusContainer = document.querySelector('.giscus');
    if (!giscusContainer) return;
    giscusContainer.innerHTML = '';

    // Create and append giscus script
    const script = document.createElement('script');
    script.src = 'https://giscus.app/client.js';
    script.setAttribute('data-repo', 'XianchengLI/Sleeping_beauty_viewer');
    script.setAttribute('data-repo-id', 'R_kgDOQ5HPHQ');
    script.setAttribute('data-category', 'Announcements');
    script.setAttribute('data-category-id', 'DIC_kwDOQ5HPHc4C08u4');
    script.setAttribute('data-mapping', 'specific');
    script.setAttribute('data-term', `case-${postId}`);
    script.setAttribute('data-strict', '0');
    script.setAttribute('data-reactions-enabled', '1');
    script.setAttribute('data-emit-metadata', '0');
    script.setAttribute('data-input-position', 'bottom');
    script.setAttribute('data-theme', 'preferred_color_scheme');
    script.setAttribute('data-lang', 'en');
    script.setAttribute('crossorigin', 'anonymous');
    script.async = true;

    giscusContainer.appendChild(script);
}

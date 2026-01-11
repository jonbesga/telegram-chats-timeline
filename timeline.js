class AnalysisApp {
    constructor(options) {
        this.fileInputId = options.fileInputId;
        this.chatSelectorId = options.chatSelectorId;
        this.timePeriodId = options.timePeriodId;
        this.chartStyleId = options.chartStyleId || null;
        this.movingAverageId = options.movingAverageId || null;
        this.errorMessageId = options.errorMessageId;
        this.fileListId = options.fileListId;
        this.messageChartId = options.messageChartId;
        this.itemLabel = options.itemLabel || 'Messages';
        this.timePeriodLabelMap = options.timePeriodLabelMap || {
            month: 'Month',
            year: 'Year',
            day: 'Day'
        };
        this.defaultTimePeriod = options.defaultTimePeriod || 'month';
        this.parseFileData = options.parseFileData || this.defaultParseFileData;
        this.aggregateBySource = options.aggregateBySource || false;
        this.sourceColorMap = options.sourceColorMap || {};
        this.sourceOrder = options.sourceOrder || [];
        this.movingAverageWindowMap = options.movingAverageWindowMap || { day: 7, month: 3, year: 3 };
        this.chart = null;
        this.loadedChats = new Map();
        this.currentChatId = null;
    }

    init() {
        this.fileInput = document.getElementById(this.fileInputId);
        this.chatSelector = document.getElementById(this.chatSelectorId);
        this.timePeriod = document.getElementById(this.timePeriodId);
        this.chartStyle = this.chartStyleId ? document.getElementById(this.chartStyleId) : null;
        this.movingAverageToggle = this.movingAverageId ? document.getElementById(this.movingAverageId) : null;
        this.errorMessage = document.getElementById(this.errorMessageId);
        this.fileList = document.getElementById(this.fileListId);
        this.messageChart = document.getElementById(this.messageChartId);

        this.fileInput.addEventListener('change', (event) => this.handleFileUpload(event));
        this.chatSelector.addEventListener('change', () => this.switchChat());
        this.timePeriod.addEventListener('change', () => this.updateChart());
        if (this.chartStyle) {
            this.chartStyle.addEventListener('change', () => this.updateChart());
        }
        if (this.movingAverageToggle) {
            this.movingAverageToggle.addEventListener('change', () => this.updateChart());
        }

        this.updateChatSelector();
        this.updateFileList();
    }

    defaultParseFileData(rawData, file) {
        if (!rawData.messages || !Array.isArray(rawData.messages)) {
            throw new Error('Invalid JSON format: missing or invalid messages array');
        }

        const dates = rawData.messages
            .map(message => message.date)
            .filter(Boolean);

        return {
            name: rawData.name || file.name,
            dates: dates
        };
    }

    showError(message) {
        this.errorMessage.textContent = message;
        this.errorMessage.style.display = 'block';
    }

    hideError() {
        this.errorMessage.style.display = 'none';
    }

    updateFileList() {
        this.fileList.innerHTML = '';

        this.loadedChats.forEach((data, id) => {
            const li = document.createElement('li');
            const nameSpan = document.createElement('span');
            nameSpan.textContent = data.source ? `${data.name} (${data.source})` : data.name;

            const removeButton = document.createElement('button');
            removeButton.textContent = 'Remove';
            removeButton.addEventListener('click', () => this.removeChat(id));

            li.appendChild(nameSpan);
            li.appendChild(removeButton);
            this.fileList.appendChild(li);
        });
    }

    updateChatSelector() {
        if (this.aggregateBySource) {
            this.chatSelector.innerHTML = '<option value="all">All sources</option>';
            this.chatSelector.value = 'all';
            this.chatSelector.disabled = true;
            this.timePeriod.disabled = this.loadedChats.size === 0;
            if (this.chartStyle) {
                this.chartStyle.disabled = this.loadedChats.size === 0;
            }
            if (this.movingAverageToggle) {
                this.movingAverageToggle.disabled = this.loadedChats.size === 0;
            }
            return;
        }

        this.chatSelector.innerHTML = '<option value="">Select a chat</option>';

        this.loadedChats.forEach((data, id) => {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = data.name;
            this.chatSelector.appendChild(option);
        });

        const isEmpty = this.loadedChats.size === 0;
        this.chatSelector.disabled = isEmpty;
        this.timePeriod.disabled = isEmpty;
        if (this.chartStyle) {
            this.chartStyle.disabled = isEmpty;
        }
        if (this.movingAverageToggle) {
            this.movingAverageToggle.disabled = isEmpty;
        }
    }

    removeChat(chatId) {
        this.loadedChats.delete(chatId);
        if (this.currentChatId === chatId) {
            this.currentChatId = null;
            if (this.chart) {
                this.chart.destroy();
                this.chart = null;
            }
        }
        this.updateFileList();
        this.updateChatSelector();
        if (this.aggregateBySource) {
            if (this.loadedChats.size === 0 && this.chart) {
                this.chart.destroy();
                this.chart = null;
                return;
            }
            this.createChart(this.timePeriod.value);
        }
    }

    switchChat() {
        if (this.aggregateBySource) {
            const timePeriod = this.timePeriod.value;
            this.createChart(timePeriod);
            return;
        }

        const chatId = this.chatSelector.value;
        if (!chatId) {
            if (this.chart) {
                this.chart.destroy();
                this.chart = null;
            }
            return;
        }

        this.currentChatId = chatId;
        const timePeriod = this.timePeriod.value;
        this.createChart(timePeriod);
    }

    handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                const parsedData = this.parseFileData(data, file);
                if (!parsedData.dates || parsedData.dates.length === 0) {
                    throw new Error('No dated items found in the uploaded file');
                }

                const chatId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
                this.loadedChats.set(chatId, {
                    name: parsedData.name,
                    dates: parsedData.dates,
                    source: parsedData.source
                });

                this.hideError();
                this.updateFileList();
                this.updateChatSelector();

                if (!this.aggregateBySource) {
                    this.chatSelector.value = chatId;
                    this.currentChatId = chatId;
                }
                this.timePeriod.value = this.defaultTimePeriod;
                this.createChart(this.defaultTimePeriod);
            } catch (error) {
                this.showError('Error loading file: ' + error.message);
            }
        };

        reader.onerror = () => {
            this.showError('Error reading file');
        };

        reader.readAsText(file);
    }

    getTimeKey(date, timePeriod) {
        if (timePeriod === 'month') {
            return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        }
        if (timePeriod === 'day') {
            return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        }
        return date.getFullYear().toString();
    }

    formatLabelForKey(key, timePeriod) {
        if (timePeriod === 'month') {
            const [year, month] = key.split('-');
            return new Date(year, month - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        }
        if (timePeriod === 'day') {
            const [year, month, day] = key.split('-');
            return new Date(year, month - 1, day).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            });
        }
        return key;
    }

    getOrderedSources(sources) {
        const ordered = [];
        const remaining = new Set(sources);
        this.sourceOrder.forEach(source => {
            if (remaining.has(source)) {
                ordered.push(source);
                remaining.delete(source);
            }
        });
        remaining.forEach(source => ordered.push(source));
        return ordered;
    }

    getSourceColors(source, index) {
        if (this.sourceColorMap[source]) {
            return this.sourceColorMap[source];
        }
        const palette = [
            { backgroundColor: 'rgba(54, 162, 235, 0.5)', borderColor: 'rgba(54, 162, 235, 1)' },
            { backgroundColor: 'rgba(40, 167, 69, 0.5)', borderColor: 'rgba(40, 167, 69, 1)' },
            { backgroundColor: 'rgba(255, 193, 7, 0.5)', borderColor: 'rgba(255, 193, 7, 1)' }
        ];
        return palette[index % palette.length];
    }

    computeMovingAverage(values, windowSize) {
        if (!windowSize || windowSize <= 1) {
            return values.slice();
        }
        const result = [];
        for (let i = 0; i < values.length; i += 1) {
            const start = Math.max(0, i - windowSize + 1);
            let sum = 0;
            let count = 0;
            for (let j = start; j <= i; j += 1) {
                sum += values[j];
                count += 1;
            }
            result.push(sum / count);
        }
        return result;
    }

    getMovingAverageDataset(processed, timePeriod) {
        if (!this.movingAverageToggle || !this.movingAverageToggle.checked) {
            return null;
        }
        const windowSize = this.movingAverageWindowMap[timePeriod];
        if (!windowSize) {
            return null;
        }
        let values = [];
        if (processed.datasets) {
            const length = processed.labels.length;
            values = new Array(length).fill(0);
            processed.datasets.forEach(dataset => {
                dataset.data.forEach((value, index) => {
                    values[index] += value;
                });
            });
        } else if (processed.data) {
            values = processed.data.slice();
        }
        const averaged = this.computeMovingAverage(values, windowSize);
        return {
            label: `${windowSize}-period moving average`,
            data: averaged,
            type: 'line',
            fill: false,
            pointRadius: 0,
            tension: 0.2,
            borderWidth: 2,
            borderColor: 'rgba(108, 117, 125, 1)',
            backgroundColor: 'rgba(108, 117, 125, 0.2)'
        };
    }

    processData(timePeriod) {
        if (this.aggregateBySource) {
            if (this.loadedChats.size === 0) {
                return { labels: [], datasets: [] };
            }

            const countsBySource = new Map();
            const allKeys = new Set();

            this.loadedChats.forEach(chat => {
                const source = chat.source || 'Unknown';
                if (!countsBySource.has(source)) {
                    countsBySource.set(source, {});
                }
                const counts = countsBySource.get(source);

                chat.dates.forEach(dateEntry => {
                    const date = new Date(dateEntry);
                    if (Number.isNaN(date.getTime())) {
                        return;
                    }
                    const key = this.getTimeKey(date, timePeriod);
                    counts[key] = (counts[key] || 0) + 1;
                    allKeys.add(key);
                });
            });

            const sortedKeys = Array.from(allKeys).sort();
            const labels = sortedKeys.map(key => this.formatLabelForKey(key, timePeriod));
            const sources = this.getOrderedSources(Array.from(countsBySource.keys()));

            const datasets = sources.map((source, index) => {
                const counts = countsBySource.get(source) || {};
                const data = sortedKeys.map(key => counts[key] || 0);
                const colors = this.getSourceColors(source, index);
                return {
                    label: `${source} ${this.itemLabel}`,
                    data: data,
                    backgroundColor: colors.backgroundColor,
                    borderColor: colors.borderColor,
                    borderWidth: 1
                };
            });

            return { labels, datasets };
        }

        if (!this.currentChatId || !this.loadedChats.has(this.currentChatId)) {
            return { labels: [], data: [] };
        }

        const dates = this.loadedChats.get(this.currentChatId).dates;
        const messageCounts = {};

        dates.forEach(dateEntry => {
            const date = new Date(dateEntry);
            if (Number.isNaN(date.getTime())) {
                return;
            }
            const key = this.getTimeKey(date, timePeriod);
            messageCounts[key] = (messageCounts[key] || 0) + 1;
        });

        const sortedKeys = Object.keys(messageCounts).sort();
        const labels = sortedKeys.map(key => this.formatLabelForKey(key, timePeriod));
        const data = sortedKeys.map(key => messageCounts[key]);

        return { labels, data };
    }

    createChart(timePeriod) {
        const processed = this.processData(timePeriod);
        const labels = processed.labels;

        const ctx = this.messageChart.getContext('2d');

        if (this.chart) {
            this.chart.destroy();
        }

        const chatName = this.currentChatId ? this.loadedChats.get(this.currentChatId).name : '';
        const timeLabel = this.timePeriodLabelMap[timePeriod] || timePeriod;
        const titleBase = this.aggregateBySource ? 'All sources' : chatName;
        const titleText = titleBase
            ? `${titleBase} - ${this.itemLabel} per ${timeLabel}`
            : `${this.itemLabel} per ${timeLabel}`;
        const datasets = processed.datasets || [{
            label: `${this.itemLabel} per ${timeLabel}`,
            data: processed.data,
            backgroundColor: 'rgba(54, 162, 235, 0.5)',
            borderColor: 'rgba(54, 162, 235, 1)',
            borderWidth: 1
        }];
        const movingAverageDataset = this.getMovingAverageDataset(processed, timePeriod);
        if (movingAverageDataset) {
            datasets.push(movingAverageDataset);
        }
        const chartStyle = this.chartStyle ? this.chartStyle.value : 'grouped';
        const isStacked = chartStyle === 'stacked';
        const chartType = chartStyle === 'line' ? 'line' : 'bar';
        const chartDatasets = datasets.map(dataset => {
            if (chartType !== 'line') {
                return dataset;
            }
            return {
                ...dataset,
                fill: false,
                pointRadius: 0,
                tension: 0.25,
                borderWidth: 2
            };
        });

        this.chart = new Chart(ctx, {
            type: chartType,
            data: {
                labels: labels,
                datasets: chartDatasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        stacked: isStacked,
                        title: {
                            display: true,
                            text: `Number of ${this.itemLabel}`
                        }
                    },
                    x: {
                        stacked: isStacked,
                        title: {
                            display: true,
                            text: timeLabel
                        }
                    }
                },
                plugins: {
                    title: {
                        display: true,
                        text: titleText,
                        font: {
                            size: 16
                        }
                    }
                }
            }
        });
    }

    updateChart() {
        const timePeriod = this.timePeriod.value;
        this.createChart(timePeriod);
    }
}

function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabPanels = document.querySelectorAll('.tab-panel');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            tabButtons.forEach(btn => {
                btn.classList.remove('active');
                btn.setAttribute('aria-selected', 'false');
            });
            tabPanels.forEach(panel => panel.classList.remove('active'));

            button.classList.add('active');
            button.setAttribute('aria-selected', 'true');

            const target = button.getAttribute('data-tab');
            const panel = document.getElementById(`${target}Tab`);
            if (panel) {
                panel.classList.add('active');
            }
        });
    });
}

function setupSourceVerification() {
    const container = document.querySelector('[data-source-verify]');
    if (!container) {
        return;
    }

    const repo = container.getAttribute('data-repo');
    const link = container.querySelector('.source-link');
    const button = container.querySelector('.verify-button');
    const status = container.querySelector('.verify-status');

    const setStatus = (text, state) => {
        status.textContent = text;
        status.setAttribute('data-state', state);
    };

    if (!repo) {
        setStatus('Not configured', 'fail');
        button.disabled = true;
        return;
    }

    if (!window.crypto || !window.crypto.subtle) {
        setStatus('Unsupported browser', 'fail');
        button.disabled = true;
        return;
    }

    const fetchText = async (url) => {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`Request failed: ${response.status}`);
        }
        return response.text();
    };

    const fetchJson = async (url) => {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`Request failed: ${response.status}`);
        }
        return response.json();
    };

    const hashText = async (text) => {
        const data = new TextEncoder().encode(text);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(value => value.toString(16).padStart(2, '0')).join('');
    };

    const loadBuildInfo = async () => {
        try {
            const buildInfo = await fetchJson(`build.json?ts=${Date.now()}`);
            const commit = buildInfo && buildInfo.commit;
            if (!commit) {
                throw new Error('Build info missing commit');
            }
            const commitUrl = `https://github.com/${repo}/tree/${commit}`;
            link.href = commitUrl;
            link.textContent = commit;
            return commit;
        } catch (error) {
            link.textContent = 'Unavailable';
            return null;
        }
    };

    loadBuildInfo();

    const verify = async () => {
        button.disabled = true;
        setStatus('Checking...', 'checking');
        try {
            const commit = await loadBuildInfo();
            if (!commit) {
                throw new Error('Build info missing commit');
            }

            const baseUrl = `https://raw.githubusercontent.com/${repo}/${commit}/`;
            const scriptTag = document.querySelector('script[src*="timeline.js"]');
            const localScriptUrl = scriptTag ? scriptTag.getAttribute('src') : 'timeline.js';
            const remoteScriptPath = localScriptUrl.split('?')[0].replace(/^\//, '') || 'timeline.js';
            const [localIndex, localScript, remoteIndex, remoteScript] = await Promise.all([
                fetchText('index.html'),
                fetchText(localScriptUrl),
                fetchText(`${baseUrl}index.html`),
                fetchText(`${baseUrl}${remoteScriptPath}`)
            ]);
            const [localIndexHash, localScriptHash, remoteIndexHash, remoteScriptHash] = await Promise.all([
                hashText(localIndex),
                hashText(localScript),
                hashText(remoteIndex),
                hashText(remoteScript)
            ]);

            if (localIndexHash === remoteIndexHash && localScriptHash === remoteScriptHash) {
                setStatus('Verified', 'ok');
            } else {
                setStatus('Mismatch', 'fail');
            }
        } catch (error) {
            setStatus('Verification failed', 'fail');
        } finally {
            button.disabled = false;
        }
    };

    button.addEventListener('click', verify);
}

document.addEventListener('DOMContentLoaded', () => {
    const telegramApp = new AnalysisApp({
        fileInputId: 'jsonFile',
        chatSelectorId: 'chatSelector',
        timePeriodId: 'timePeriod',
        errorMessageId: 'errorMessage',
        fileListId: 'fileList',
        messageChartId: 'messageChart',
        itemLabel: 'Messages',
        defaultTimePeriod: 'month'
    });

    const aiApp = new AnalysisApp({
        fileInputId: 'aiJsonFile',
        chatSelectorId: 'aiChatSelector',
        timePeriodId: 'aiTimePeriod',
        chartStyleId: 'aiChartStyle',
        movingAverageId: 'aiMovingAverage',
        errorMessageId: 'aiErrorMessage',
        fileListId: 'aiFileList',
        messageChartId: 'aiMessageChart',
        itemLabel: 'Conversations',
        defaultTimePeriod: 'day',
        aggregateBySource: true,
        sourceOrder: ['Claude', 'OpenAI', 'Unknown'],
        sourceColorMap: {
            Claude: { backgroundColor: 'rgba(54, 162, 235, 0.5)', borderColor: 'rgba(54, 162, 235, 1)' },
            OpenAI: { backgroundColor: 'rgba(40, 167, 69, 0.5)', borderColor: 'rgba(40, 167, 69, 1)' },
            Unknown: { backgroundColor: 'rgba(255, 193, 7, 0.5)', borderColor: 'rgba(255, 193, 7, 1)' }
        },
        movingAverageWindowMap: { day: 7, month: 3 },
        parseFileData: (rawData, file) => {
            if (!Array.isArray(rawData)) {
                throw new Error('Invalid JSON format: expected a conversations array');
            }

            const first = rawData[0] || {};
            if (typeof first.create_time === 'number' || typeof first.update_time === 'number') {
                const dates = rawData
                    .map(conversation => conversation.create_time || conversation.update_time)
                    .filter(value => typeof value === 'number')
                    .map(value => value * 1000);

                return {
                    name: file.name,
                    dates: dates,
                    source: 'OpenAI'
                };
            }

            if (typeof first.created_at === 'string' || typeof first.updated_at === 'string') {
                const dates = rawData
                    .map(conversation => conversation.created_at || conversation.updated_at)
                    .filter(Boolean);

                return {
                    name: file.name,
                    dates: dates,
                    source: 'Claude'
                };
            }

            throw new Error('Unrecognized conversations format');
        }
    });

    telegramApp.init();
    aiApp.init();
    setupTabs();
    setupSourceVerification();
});

class AnalysisApp {
    constructor(options) {
        this.fileInputId = options.fileInputId;
        this.chatSelectorId = options.chatSelectorId;
        this.timePeriodId = options.timePeriodId;
        this.chartStyleId = options.chartStyleId || null;
        this.movingAverageId = options.movingAverageId || null;
        this.extraDashboardsId = options.extraDashboardsId || null;
        this.hourHeatmapId = options.hourHeatmapId || null;
        this.memberWordCloudsId = options.memberWordCloudsId || null;
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
        this.extraCharts = [];
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
        this.extraDashboards = this.extraDashboardsId ? document.getElementById(this.extraDashboardsId) : null;
        this.hourHeatmap = this.hourHeatmapId ? document.getElementById(this.hourHeatmapId) : null;
        this.memberWordClouds = this.memberWordCloudsId ? document.getElementById(this.memberWordCloudsId) : null;

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

        const messages = rawData.messages;
        const dates = messages
            .map(message => message.date)
            .filter(Boolean);

        const chatType = (rawData.type || '').toLowerCase();
        const isGroup = chatType.includes('group') || chatType.includes('supergroup') || chatType.includes('channel');
        const topicsById = new Map();
        const messageTopicMap = new Map();
        const memberWordCounts = {};
        const memberMessageCounts = {};

        if (isGroup) {
            messages.forEach(message => {
                if (message.type === 'service' && message.action === 'topic_created') {
                    const topicId = String(message.id);
                    topicsById.set(topicId, {
                        name: message.title || `Topic ${message.id}`,
                        memberCounts: {},
                        hourCounts: Array.from({ length: 24 }, () => 0),
                        memberHourCounts: {}
                    });
                }
            });

            messages.forEach(message => {
                if (!message.reply_to_message_id) {
                    return;
                }
                const replyToId = String(message.reply_to_message_id);
                if (topicsById.has(replyToId)) {
                    messageTopicMap.set(String(message.id), replyToId);
                    return;
                }
                if (messageTopicMap.has(replyToId)) {
                    messageTopicMap.set(String(message.id), messageTopicMap.get(replyToId));
                }
            });

            messages.forEach(message => {
                const topicInfo = this.extractTopicInfo(message);
                const topicId = topicInfo ? topicInfo.id : messageTopicMap.get(String(message.id));
                if (!topicId) {
                    return;
                }
                if (!topicsById.has(topicId)) {
                    topicsById.set(topicId, {
                        name: topicInfo ? topicInfo.name : `Topic ${topicId}`,
                        memberCounts: {},
                        hourCounts: Array.from({ length: 24 }, () => 0),
                        memberHourCounts: {}
                    });
                }
                const topic = topicsById.get(topicId);
                if (topicInfo && topicInfo.name && topic.name === `Topic ${topicId}`) {
                    topic.name = topicInfo.name;
                }
                if (!Array.isArray(topic.hourCounts) || topic.hourCounts.length !== 24) {
                    topic.hourCounts = Array.from({ length: 24 }, () => 0);
                }
                if (!topic.memberHourCounts || typeof topic.memberHourCounts !== 'object') {
                    topic.memberHourCounts = {};
                }
                if (message.type !== 'message') {
                    return;
                }
                const member = this.getMessageMember(message);
                if (!member) {
                    return;
                }
                topic.memberCounts[member] = (topic.memberCounts[member] || 0) + 1;
                const messageDate = new Date(message.date);
                if (!Number.isNaN(messageDate.getTime())) {
                    const hour = messageDate.getHours();
                    if (typeof topic.hourCounts[hour] === 'number') {
                        topic.hourCounts[hour] += 1;
                    }
                    if (!topic.memberHourCounts[member]) {
                        topic.memberHourCounts[member] = new Array(24).fill(0);
                    }
                    topic.memberHourCounts[member][hour] += 1;
                }
            });
        }

        messages.forEach(message => {
            if (message.type !== 'message') {
                return;
            }
            const member = this.getMessageMember(message);
            if (!member) {
                return;
            }
            memberMessageCounts[member] = (memberMessageCounts[member] || 0) + 1;
            const text = this.extractMessageText(message);
            if (!text) {
                return;
            }
            const words = this.tokenizeWords(text);
            if (words.length === 0) {
                return;
            }
            if (!memberWordCounts[member]) {
                memberWordCounts[member] = {};
            }
            const wordCounts = memberWordCounts[member];
            words.forEach(word => {
                wordCounts[word] = (wordCounts[word] || 0) + 1;
            });
        });

        return {
            name: rawData.name || file.name,
            dates: dates,
            isGroup: isGroup,
            topics: Array.from(topicsById, ([id, topic]) => ({ id, ...topic })),
            memberWordCounts: memberWordCounts,
            memberMessageCounts: memberMessageCounts
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
            this.clearExtraDashboards();
            this.clearHourHeatmap();
            this.clearMemberWordClouds();
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
            this.clearExtraDashboards();
            this.clearHourHeatmap();
            this.clearMemberWordClouds();
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
                    source: parsedData.source,
                    isGroup: parsedData.isGroup,
                    topics: parsedData.topics,
                    memberWordCounts: parsedData.memberWordCounts,
                    memberMessageCounts: parsedData.memberMessageCounts
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

        this.renderExtraDashboards();
        this.renderHourHeatmap();
        this.renderMemberWordClouds();
    }

    updateChart() {
        const timePeriod = this.timePeriod.value;
        this.createChart(timePeriod);
    }

    clearHourHeatmap() {
        if (!this.hourHeatmap) {
            return;
        }
        this.hourHeatmap.innerHTML = '';
    }

    renderHourHeatmap() {
        if (!this.hourHeatmap) {
            return;
        }
        this.clearHourHeatmap();

        if (this.aggregateBySource) {
            return;
        }
        if (!this.currentChatId || !this.loadedChats.has(this.currentChatId)) {
            return;
        }

        const chatData = this.loadedChats.get(this.currentChatId);
        const dates = Array.isArray(chatData.dates) ? chatData.dates : [];
        if (dates.length === 0) {
            return;
        }

        const counts = new Array(24).fill(0);
        dates.forEach(dateEntry => {
            const date = new Date(dateEntry);
            if (Number.isNaN(date.getTime())) {
                return;
            }
            const hour = date.getHours();
            counts[hour] += 1;
        });

        const title = document.createElement('div');
        title.className = 'hour-heatmap-title';
        title.textContent = 'Messages by hour';
        this.hourHeatmap.appendChild(title);

        const grid = document.createElement('div');
        grid.className = 'hour-heatmap-grid';
        const maxCount = Math.max(...counts, 0);

        counts.forEach((count, hour) => {
            const cell = document.createElement('div');
            cell.className = 'hour-heatmap-cell';
            const intensity = maxCount ? count / maxCount : 0;
            const alpha = count ? 0.12 + (0.78 * intensity) : 0;
            cell.style.backgroundColor = count ? `rgba(40, 167, 69, ${alpha.toFixed(2)})` : '#f1f3f5';
            cell.title = `${String(hour).padStart(2, '0')}:00 · ${count} messages`;
            grid.appendChild(cell);
        });
        this.hourHeatmap.appendChild(grid);

        const hourLabels = document.createElement('div');
        hourLabels.className = 'hour-heatmap-hours';
        ['00', '06', '12', '18', '23'].forEach(label => {
            const span = document.createElement('span');
            span.textContent = label;
            hourLabels.appendChild(span);
        });
        this.hourHeatmap.appendChild(hourLabels);
    }

    clearMemberWordClouds() {
        if (!this.memberWordClouds) {
            return;
        }
        this.memberWordClouds.innerHTML = '';
    }

    renderMemberWordClouds() {
        if (!this.memberWordClouds) {
            return;
        }
        this.clearMemberWordClouds();

        if (this.aggregateBySource) {
            return;
        }
        if (!this.currentChatId || !this.loadedChats.has(this.currentChatId)) {
            return;
        }

        const chatData = this.loadedChats.get(this.currentChatId);
        const memberWordCounts = chatData.memberWordCounts || {};
        const memberMessageCounts = chatData.memberMessageCounts || {};
        const members = Object.keys(memberWordCounts);
        if (members.length === 0) {
            return;
        }

        const heading = document.createElement('h3');
        heading.textContent = 'Member word clouds';
        heading.className = 'member-clouds-heading';
        this.memberWordClouds.appendChild(heading);

        const sortedMembers = members.sort((a, b) => {
            const countA = memberMessageCounts[a] || 0;
            const countB = memberMessageCounts[b] || 0;
            return countB - countA;
        }).slice(0, 6);

        const grid = document.createElement('div');
        grid.className = 'member-clouds-grid';

        sortedMembers.forEach(member => {
            const card = document.createElement('div');
            card.className = 'member-cloud-card';

            const title = document.createElement('div');
            title.className = 'member-cloud-title';
            title.textContent = member;
            card.appendChild(title);

            const words = memberWordCounts[member] || {};
            const entries = Object.entries(words).sort((a, b) => b[1] - a[1]).slice(0, 30);
            const maxCount = entries.length ? entries[0][1] : 1;

            const cloud = document.createElement('div');
            cloud.className = 'member-cloud-words';
            entries.forEach(([word, count]) => {
                const span = document.createElement('span');
                span.className = 'member-cloud-word';
                const ratio = maxCount ? count / maxCount : 0;
                const size = 12 + Math.round(18 * ratio);
                span.style.fontSize = `${size}px`;
                span.style.opacity = (0.5 + 0.5 * ratio).toFixed(2);
                span.textContent = word;
                cloud.appendChild(span);
            });
            card.appendChild(cloud);
            grid.appendChild(card);
        });

        this.memberWordClouds.appendChild(grid);
    }

    extractMessageText(message) {
        if (typeof message.text === 'string') {
            return message.text;
        }
        if (Array.isArray(message.text)) {
            return message.text
                .map(entry => {
                    if (typeof entry === 'string') {
                        return entry;
                    }
                    if (entry && typeof entry.text === 'string') {
                        return entry.text;
                    }
                    return '';
                })
                .join(' ');
        }
        return '';
    }

    tokenizeWords(text) {
        const lower = text.toLowerCase();
        const parts = lower.split(/[^a-z0-9']+/);
        const stopWords = this.getStopWords();
        return parts.filter(word => word.length > 2 && !stopWords.has(word));
    }

    getStopWords() {
        return new Set([
            'the', 'and', 'for', 'that', 'this', 'with', 'you', 'your', 'are', 'but', 'not', 'was', 'were',
            'have', 'has', 'had', 'its', 'they', 'them', 'their', 'from', 'about', 'just', 'what', 'when',
            'where', 'who', 'why', 'how', 'can', 'could', 'should', 'would', 'will', 'wont', 'dont', 'does',
            'did', 'been', 'being', 'into', 'out', 'our', 'ours', 'his', 'her', 'she', 'him', 'i', 'im',
            'me', 'my', 'we', 'us', 'at', 'in', 'on', 'of', 'to', 'is', 'it', 'as', 'or', 'if', 'so',
            'no', 'yes', 'ok', 'okay', 'lol', 'lmao', 'haha', 'https', 'http', 'www', 'com', 'net'
        ]);
    }

    getMessageMember(message) {
        if (typeof message.from === 'string' && message.from.trim() !== '') {
            return message.from;
        }
        if (typeof message.actor === 'string' && message.actor.trim() !== '') {
            return message.actor;
        }
        if (typeof message.from_id === 'string' && message.from_id.trim() !== '') {
            return message.from_id;
        }
        return null;
    }

    extractTopicInfo(message) {
        const directTopicId = message.topic_id ?? message.thread_id ?? message.topicId ?? message.forum_topic_id;
        let topicId = directTopicId;
        let topicName = message.topic_title ?? message.topic_name;

        if (!topicId && message.topic) {
            if (typeof message.topic === 'string') {
                topicId = message.topic;
                topicName = message.topic;
            } else if (typeof message.topic === 'object') {
                topicId = message.topic.id ?? message.topic.topic_id;
                topicName = message.topic.title || message.topic.name;
            }
        }

        if (!topicId && message.forum_topic) {
            if (typeof message.forum_topic === 'object') {
                topicId = message.forum_topic.id ?? message.forum_topic.topic_id;
                topicName = message.forum_topic.title || message.forum_topic.name;
            }
        }

        if (!topicId) {
            return null;
        }

        return {
            id: String(topicId),
            name: topicName || `Topic ${topicId}`
        };
    }

    clearExtraDashboards() {
        if (!this.extraDashboards) {
            return;
        }
        this.extraCharts.forEach(chart => chart.destroy());
        this.extraCharts = [];
        this.extraDashboards.innerHTML = '';
    }

    renderExtraDashboards() {
        if (!this.extraDashboards) {
            return;
        }

        this.clearExtraDashboards();

        if (!this.currentChatId || !this.loadedChats.has(this.currentChatId)) {
            return;
        }

        const chatData = this.loadedChats.get(this.currentChatId);
        if (!chatData.isGroup) {
            return;
        }

        const topics = Array.isArray(chatData.topics) ? chatData.topics : [];
        const nonEmptyTopics = topics.filter(topic => Object.keys(topic.memberCounts || {}).length > 0);
        const heading = document.createElement('h3');
        heading.textContent = 'Topic dashboards';
        heading.className = 'topic-dashboard-heading';
        this.extraDashboards.appendChild(heading);

        if (nonEmptyTopics.length === 0) {
            const note = document.createElement('div');
            note.className = 'topic-dashboard-empty';
            note.textContent = 'No topic breakdown available for this chat export.';
            this.extraDashboards.appendChild(note);
            return;
        }

        nonEmptyTopics.sort((a, b) => {
            const aTotal = Object.values(a.memberCounts || {}).reduce((sum, value) => sum + value, 0);
            const bTotal = Object.values(b.memberCounts || {}).reduce((sum, value) => sum + value, 0);
            return bTotal - aTotal;
        });

        nonEmptyTopics.forEach(topic => {
            const section = document.createElement('section');
            section.className = 'topic-section';

            const title = document.createElement('h4');
            title.textContent = topic.name || 'Untitled topic';
            section.appendChild(title);

            const chartContainer = document.createElement('div');
            chartContainer.className = 'chart-container topic-chart-container';
            const canvas = document.createElement('canvas');
            chartContainer.appendChild(canvas);
            section.appendChild(chartContainer);

            const heatmapContainer = document.createElement('div');
            heatmapContainer.className = 'topic-heatmap';
            const heatmapTitle = document.createElement('div');
            heatmapTitle.className = 'topic-heatmap-title';
            heatmapTitle.textContent = 'Messages by hour';
            heatmapContainer.appendChild(heatmapTitle);

            const heatmapGrid = document.createElement('div');
            heatmapGrid.className = 'topic-heatmap-grid';
            const hourCounts = Array.isArray(topic.hourCounts) ? topic.hourCounts.slice(0, 24) : new Array(24).fill(0);
            while (hourCounts.length < 24) {
                hourCounts.push(0);
            }
            const maxCount = Math.max(...hourCounts, 0);
            hourCounts.forEach((count, hour) => {
                const cell = document.createElement('div');
                cell.className = 'topic-heatmap-cell';
                const intensity = maxCount ? count / maxCount : 0;
                const alpha = count ? 0.15 + (0.75 * intensity) : 0;
                cell.style.backgroundColor = count ? `rgba(13, 110, 253, ${alpha.toFixed(2)})` : '#f1f3f5';
                cell.title = `${String(hour).padStart(2, '0')}:00 - ${count} messages`;
                heatmapGrid.appendChild(cell);
            });
            heatmapContainer.appendChild(heatmapGrid);

            const heatmapLabels = document.createElement('div');
            heatmapLabels.className = 'topic-heatmap-labels';
            ['0', '6', '12', '18', '23'].forEach(label => {
                const span = document.createElement('span');
                span.textContent = label;
                heatmapLabels.appendChild(span);
            });
            heatmapContainer.appendChild(heatmapLabels);
            section.appendChild(heatmapContainer);

            const lineContainer = document.createElement('div');
            lineContainer.className = 'chart-container topic-line-container';
            const lineCanvas = document.createElement('canvas');
            lineContainer.appendChild(lineCanvas);
            section.appendChild(lineContainer);
            this.extraDashboards.appendChild(section);

            const entries = Object.entries(topic.memberCounts || {});
            entries.sort((a, b) => b[1] - a[1]);
            const labels = entries.map(([member]) => member);
            const data = entries.map(([, count]) => count);

            const ctx = canvas.getContext('2d');
            const topicChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Messages per member',
                        data: data,
                        backgroundColor: 'rgba(13, 110, 253, 0.35)',
                        borderColor: 'rgba(13, 110, 253, 1)',
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: 'Messages'
                            }
                        },
                        x: {
                            title: {
                                display: true,
                                text: 'Members'
                            }
                        }
                    },
                    plugins: {
                        title: {
                            display: true,
                            text: `${topic.name || 'Topic'} - messages per member`,
                            font: {
                                size: 14
                            }
                        },
                        legend: {
                            display: false
                        }
                    }
                }
            });

            this.extraCharts.push(topicChart);

            const memberHourCounts = topic.memberHourCounts || {};
            const topMembers = entries.slice(0, 8).map(([member]) => member);
            const lineLabels = Array.from({ length: 24 }, (_, index) => `${String(index).padStart(2, '0')}:00`);
            const lineDatasets = topMembers.map((member, index) => {
                const counts = Array.isArray(memberHourCounts[member]) ? memberHourCounts[member] : new Array(24).fill(0);
                const colors = this.getLineColors(index);
                return {
                    label: member,
                    data: counts,
                    borderColor: colors.borderColor,
                    backgroundColor: colors.backgroundColor,
                    fill: false,
                    pointRadius: 0,
                    tension: 0.25,
                    borderWidth: 2
                };
            });

            const lineCtx = lineCanvas.getContext('2d');
            const lineChart = new Chart(lineCtx, {
                type: 'line',
                data: {
                    labels: lineLabels,
                    datasets: lineDatasets
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: 'Messages'
                            }
                        },
                        x: {
                            title: {
                                display: true,
                                text: 'Hour'
                            }
                        }
                    },
                    plugins: {
                        title: {
                            display: true,
                            text: `${topic.name || 'Topic'} - messages per hour by member`,
                            font: {
                                size: 14
                            }
                        }
                    }
                }
            });

            this.extraCharts.push(lineChart);
        });
    }

    getLineColors(index) {
        const palette = [
            { backgroundColor: 'rgba(13, 110, 253, 0.2)', borderColor: 'rgba(13, 110, 253, 1)' },
            { backgroundColor: 'rgba(25, 135, 84, 0.2)', borderColor: 'rgba(25, 135, 84, 1)' },
            { backgroundColor: 'rgba(255, 193, 7, 0.2)', borderColor: 'rgba(255, 193, 7, 1)' },
            { backgroundColor: 'rgba(220, 53, 69, 0.2)', borderColor: 'rgba(220, 53, 69, 1)' },
            { backgroundColor: 'rgba(111, 66, 193, 0.2)', borderColor: 'rgba(111, 66, 193, 1)' },
            { backgroundColor: 'rgba(32, 201, 151, 0.2)', borderColor: 'rgba(32, 201, 151, 1)' },
            { backgroundColor: 'rgba(102, 16, 242, 0.2)', borderColor: 'rgba(102, 16, 242, 1)' },
            { backgroundColor: 'rgba(13, 202, 240, 0.2)', borderColor: 'rgba(13, 202, 240, 1)' }
        ];
        return palette[index % palette.length];
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
        extraDashboardsId: 'topicDashboards',
        hourHeatmapId: 'hourHeatmap',
        memberWordCloudsId: 'memberWordClouds',
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

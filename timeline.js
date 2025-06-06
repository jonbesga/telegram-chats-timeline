let chart = null;
let loadedChats = new Map(); // Map to store all loaded chat data
let currentChatId = null;

function showError(message) {
    const errorElement = document.getElementById('errorMessage');
    errorElement.textContent = message;
    errorElement.style.display = 'block';
}

function hideError() {
    const errorElement = document.getElementById('errorMessage');
    errorElement.style.display = 'none';
}

function updateFileList() {
    const fileList = document.getElementById('fileList');
    fileList.innerHTML = '';
    
    loadedChats.forEach((data, id) => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span>${data.name}</span>
            <button onclick="removeChat('${id}')">Remove</button>
        `;
        fileList.appendChild(li);
    });
}

function updateChatSelector() {
    const selector = document.getElementById('chatSelector');
    selector.innerHTML = '<option value="">Select a chat</option>';
    
    loadedChats.forEach((data, id) => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = data.name;
        selector.appendChild(option);
    });
    
    selector.disabled = loadedChats.size === 0;
    document.getElementById('timePeriod').disabled = loadedChats.size === 0;
}

function removeChat(chatId) {
    loadedChats.delete(chatId);
    if (currentChatId === chatId) {
        currentChatId = null;
        if (chart) {
            chart.destroy();
            chart = null;
        }
    }
    updateFileList();
    updateChatSelector();
}

function switchChat() {
    const chatId = document.getElementById('chatSelector').value;
    if (!chatId) {
        if (chart) {
            chart.destroy();
            chart = null;
        }
        return;
    }
    
    currentChatId = chatId;
    const timePeriod = document.getElementById('timePeriod').value;
    createChart(timePeriod);
}

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if (!data.messages || !Array.isArray(data.messages)) {
                throw new Error('Invalid JSON format: missing or invalid messages array');
            }
            
            // Generate a unique ID for this chat
            const chatId = Date.now().toString();
            loadedChats.set(chatId, {
                name: data.name || file.name,
                messages: data.messages
            });
            
            hideError();
            updateFileList();
            updateChatSelector();
            
            // Select the newly added chat
            document.getElementById('chatSelector').value = chatId;
            currentChatId = chatId;
            createChart('month'); // Default to monthly view
            
        } catch (error) {
            showError('Error loading file: ' + error.message);
        }
    };

    reader.onerror = function() {
        showError('Error reading file');
    };

    reader.readAsText(file);
}

function processData(timePeriod) {
    if (!currentChatId || !loadedChats.has(currentChatId)) {
        return { labels: [], data: [] };
    }

    const messages = loadedChats.get(currentChatId).messages;
    const messageCounts = {};
    
    messages.forEach(message => {
        const date = new Date(message.date);
        let key;
        
        if (timePeriod === 'month') {
            // Format: "YYYY-MM"
            key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        } else {
            // Format: "YYYY"
            key = date.getFullYear().toString();
        }
        
        messageCounts[key] = (messageCounts[key] || 0) + 1;
    });
    
    // Sort the keys chronologically
    const sortedKeys = Object.keys(messageCounts).sort();
    
    // Format labels for display
    const labels = sortedKeys.map(key => {
        if (timePeriod === 'month') {
            const [year, month] = key.split('-');
            return new Date(year, month - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        }
        return key;
    });
    
    const data = sortedKeys.map(key => messageCounts[key]);
    
    return { labels, data };
}

function createChart(timePeriod) {
    const { labels, data } = processData(timePeriod);
    
    const ctx = document.getElementById('messageChart').getContext('2d');
    
    // Destroy existing chart if it exists
    if (chart) {
        chart.destroy();
    }
    
    const chatName = currentChatId ? loadedChats.get(currentChatId).name : '';
    
    chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: `Messages per ${timePeriod === 'month' ? 'Month' : 'Year'}`,
                data: data,
                backgroundColor: 'rgba(54, 162, 235, 0.5)',
                borderColor: 'rgba(54, 162, 235, 1)',
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
                        text: 'Number of Messages'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Time Period'
                    }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: `${chatName} - Messages per ${timePeriod === 'month' ? 'Month' : 'Year'}`,
                    font: {
                        size: 16
                    }
                }
            }
        }
    });
}

function updateChart() {
    const timePeriod = document.getElementById('timePeriod').value;
    createChart(timePeriod);
}

// Load data when the page loads
document.addEventListener('DOMContentLoaded', loadData); 
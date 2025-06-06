import json
import pandas as pd
import matplotlib.pyplot as plt
from datetime import datetime
import seaborn as sns

def load_messages(file_path):
    """Load messages from a JSON file."""
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    return data['messages']

def create_timeline(messages, time_period='month'):
    """
    Create a timeline of message frequency.
    
    Args:
        messages (list): List of message dictionaries
        time_period (str): 'month' or 'year'
    """
    # Convert messages to DataFrame
    df = pd.DataFrame(messages)
    
    # Convert date strings to datetime
    df['date'] = pd.to_datetime(df['date'])
    
    # Set the date as index
    df.set_index('date', inplace=True)
    
    # Resample based on time period
    if time_period == 'month':
        freq = 'M'
        title = 'Messages per Month'
        date_format = '%b %Y'  # e.g., "Jan 2023"
    else:  # year
        freq = 'Y'
        title = 'Messages per Year'
        date_format = '%Y'  # e.g., "2023"
    
    # Count messages per time period
    message_counts = df.resample(freq).size()
    
    # Create the plot
    plt.figure(figsize=(15, 6))
    sns.set_style("whitegrid")
    
    # Create bar plot
    ax = message_counts.plot(kind='bar')
    
    # Customize the plot
    plt.title(title, fontsize=14, pad=20)
    plt.xlabel('Time Period', fontsize=12)
    plt.ylabel('Number of Messages', fontsize=12)
    
    # Format x-axis labels
    plt.xticks(range(len(message_counts)), 
               [d.strftime(date_format) for d in message_counts.index],
               rotation=45, ha='right')
    
    # Adjust layout to prevent label cutoff
    plt.tight_layout()
    
    # Save the plot
    plt.savefig(f'message_timeline_{time_period}.png', dpi=300, bbox_inches='tight')
    plt.close()

def main():
    # Load messages from JSON file
    messages = load_messages('nagore.json')
    
    # Create timelines for different periods
    for period in ['month', 'year']:
        create_timeline(messages, period)
        print(f"Created {period}ly timeline")

if __name__ == "__main__":
    main() 
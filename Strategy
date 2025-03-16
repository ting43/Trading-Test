# Trading-Test
import pandas as pd
import matplotlib.pyplot as plt
from finlab import data
import numpy as np

# 初始化 FinLab 資料
#data = Data()

# 參數設定
stock_id = "2303"
start_date = "2020-01-01"
end_date = "2024-12-31"
atr_threshold = 1.2  # 設定 ATR 濾網閾值，可以根據需求調整

# 手續費與交易稅設定
def calculate_transaction_fee(amount):
    return max(amount * 0.001425, 20)  # 手續費最低 20 元

def calculate_transaction_tax(amount):
    return amount * 0.003  # 交易稅 0.3%

# 獲取股價資料
close = data.get('price:收盤價')[f"{stock_id}"]
openn = data.get('price:開盤價')[f"{stock_id}"]
low = data.get('price:最低價')[f"{stock_id}"]
high = data.get('price:最高價')[f"{stock_id}"]
volume = data.get('price:成交股數')[f"{stock_id}"]  # 獲取成交量

stock_data = pd.DataFrame({
    'close': close,
    'open': openn,
    'low': low,
    'high': high,
    'volume': volume
})

close_prices = stock_data["close"]

# 計算移動平均線
short_ma = close_prices.rolling(window=5).mean()
long_ma = close_prices.rolling(window=20).mean()

# 計算ATR (Average True Range)
high_low = high - low
high_close_prev = abs(high - close.shift(1))
low_close_prev = abs(low - close.shift(1))

true_range = pd.concat([high_low, high_close_prev, low_close_prev], axis=1)
atr = true_range.max(axis=1).rolling(window=14).mean()

# 計算最近 5 日平均成交量
avg_volume = stock_data["volume"].rolling(window=5).mean()

# 計算 5 日新高
high_5day = close_prices.rolling(window=5).max()
is_new_high = close_prices.shift(1) >= high_5day.shift(1)  # 創 5 日新高的信號

# 產生交易訊號
buy_signal = (short_ma > long_ma) & (short_ma.shift(1) <= long_ma.shift(1)) & (atr < atr_threshold) & (volume > avg_volume)
sell_signal = (short_ma < long_ma) & (short_ma.shift(1) >= long_ma.shift(1)) & (atr < atr_threshold) & (volume > avg_volume)

# 建立交易紀錄，加入開盤價資料
trades = pd.DataFrame(index=close_prices.index)
trades["close"] = close_prices
trades["open"] = stock_data["open"]  # 加入開盤價資料
trades["buy_signal"] = buy_signal
trades["sell_signal"] = sell_signal
trades["new_high"] = is_new_high

# 模擬交易
position = 0  # 持有的張數
entry_price = 0  # 進場價格
trade_history = []  # 交易歷史記錄
cum_profit = []  # 累計損益
profit = 0  # 總損益

for date, row in trades.iterrows():
    if row["buy_signal"] and position == 0:
        # 建立多頭部位，買進一張
        entry_price = row["close"]  # 進場價格
        transaction_amount = entry_price * 1000
        fee = calculate_transaction_fee(transaction_amount)
        profit -= fee  # 扣除手續費
        position = 1  # 持有一張
        trade_history.append({"type": "Buy", "date": date, "price": entry_price, "shares": 1000, "fee": fee})  # 紀錄交易
    elif row["new_high"] and position > 0:
        # 加碼，買進更多股票
        add_price = row["open"]  # 加碼以開盤價執行
        transaction_amount = add_price * 1000
        fee = calculate_transaction_fee(transaction_amount)
        profit -= fee  # 扣除手續費
        position += 1  # 增加持倉
        trade_history.append({"type": "Add", "date": date, "price": add_price, "shares": 1000, "fee": fee})  # 紀錄交易
    elif row["sell_signal"] and position > 0:
        # 平倉，賣出所有持倉
        exit_price = row["close"]  # 出場價格
        transaction_amount = exit_price * 1000 * position
        fee = calculate_transaction_fee(transaction_amount)
        tax = calculate_transaction_tax(transaction_amount)
        trade_profit = (exit_price - entry_price) * 1000 * position - fee - tax  # 扣除手續費與交易稅
        profit += trade_profit  # 更新總損益
        trade_history.append({
            "type": "Sell", "date": date, "price": exit_price, "shares": 1000 * position,
            "fee": fee, "tax": tax, "profit": trade_profit
        })  # 紀錄交易
        position = 0  # 清空部位
    cum_profit.append(profit)  # 更新累計損益

# 計算績效指標
trade_df = pd.DataFrame(trade_history)
wins = trade_df[trade_df["type"] == "Sell"]["profit"] > 0
win_rate = wins.mean() if len(wins) > 0 else 0
total_trades = len(wins)
profit_factor = trade_df[trade_df["type"] == "Sell"]["profit"].sum() / abs(
    trade_df[trade_df["type"] == "Sell"]["profit"][trade_df["profit"] < 0].sum()
) if total_trades > 0 else 0
avg_win = trade_df[trade_df["type"] == "Sell"]["profit"][trade_df["profit"] > 0].mean()
avg_loss = abs(trade_df[trade_df["type"] == "Sell"]["profit"][trade_df["profit"] < 0].mean())
pl_ratio = avg_win / avg_loss if avg_loss > 0 else 0

# 計算 MDD 和 MDD 百分比
peak = cum_profit[0]
max_drawdown = 0
max_peak = peak  # 追踪歷史峰值

for value in cum_profit:
    if value > peak:
        peak = value  # 更新峰值
    drawdown = peak - value  # 當前回撤
    if drawdown > max_drawdown:
        max_drawdown = drawdown  # 更新最大回撤

# 計算最大回撤百分比
if max_peak != 0:
    max_drawdown_rate = (max_drawdown / max_peak) * 100
else:
    max_drawdown_rate = 0

# 輸出績效結果
print(f"標的: {stock_id}")
print(f"交易範圍: {start_date} 至 {end_date}")
print(f"勝率: {win_rate * 100:.2f}%")
print(f"交易次數: {total_trades}")
print(f"獲利因子: {profit_factor:.2f}")
print(f"賺賠比: {pl_ratio:.2f}")
print(f"最大回撤: {max_drawdown:.2f}")
print(f"最大回撤百分比: {max_drawdown_rate:.2f}%")  # 新增輸出
print(f"累計損益: {cum_profit[-1]:.2f}")

# 畫累計損益圖
plt.figure(figsize=(12, 6))
plt.plot(cum_profit, label="Cumulative P&L")
plt.title("Cumulative P&L chart")
plt.xlabel("date")  # 日期
plt.ylabel("Accumulated profit")  # 累計損益
plt.legend()
plt.grid()
plt.show()

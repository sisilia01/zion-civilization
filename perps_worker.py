import asyncio
import httpx
import psycopg2
import random
import json
import os
import re
import subprocess
import time
from datetime import datetime, timedelta, timezone

try:
    from openrouter_key import _load_env_file

    _load_env_file()
except ImportError:
    pass

DB_CONFIG = {
    "host": os.environ.get("DB_HOST", "localhost"),
    "port": 5432,
    "database": os.environ.get("DB_NAME", "zion_db"),
    "user": os.environ.get("DB_USER", "zion_user"),
    "password": os.environ.get("DB_PASSWORD", ""),
}

HYPERLIQUID_API = "https://api.hyperliquid.xyz/info"
PAIRS = ["BTC", "ETH", "SUI", "SOL", "BNB", "DOGE", "AVAX", "ARB", "OP"]

market_analysis_cache = {}
cache_updated_at = {}

STATIC_BLACKLIST = {
    "SOL_LONG": True,
    "AVAX_LONG": True,
}

BLACKLIST = dict(STATIC_BLACKLIST)


def get_db():
    return psycopg2.connect(**DB_CONFIG)


def _parse_json_field(val, default):
    if val is None:
        return default
    if isinstance(val, (dict, list)):
        return val
    if isinstance(val, str):
        try:
            return json.loads(val) if val else default
        except json.JSONDecodeError:
            return default
    return default


async def fetch_prices():
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.post(HYPERLIQUID_API, json={"type": "allMids"})
        data = r.json()
        return {p: float(data[p]) for p in PAIRS if p in data}


INTERVAL_MINUTES = {"1m": 1, "5m": 5, "15m": 15, "1h": 60, "4h": 240}


async def fetch_candles(pair: str, interval: str = "15m", limit: int = 20):
    """Fetch OHLCV candles from Hyperliquid"""
    try:
        now = datetime.now(timezone.utc)
        bar_minutes = INTERVAL_MINUTES.get(interval, 15)
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                HYPERLIQUID_API,
                json={
                    "type": "candleSnapshot",
                    "req": {
                        "coin": pair,
                        "interval": interval,
                        "startTime": int((now.timestamp() - limit * bar_minutes * 60) * 1000),
                        "endTime": int(now.timestamp() * 1000),
                    },
                },
            )
            candles = response.json()
            if not isinstance(candles, list):
                return []
            return candles
    except Exception as e:
        print(f"Candles fetch error for {pair}: {e}", flush=True)
        return []


def _candle_close(candle) -> float:
    if isinstance(candle, dict):
        return float(candle.get("c", candle.get("close", 0)))
    return float(candle[4])


def _candle_high(candle) -> float:
    if isinstance(candle, dict):
        return float(candle.get("h", candle.get("high", 0)))
    return float(candle[2])


def _candle_low(candle) -> float:
    if isinstance(candle, dict):
        return float(candle.get("l", candle.get("low", 0)))
    return float(candle[3])


def _candle_volume(candle) -> float:
    if isinstance(candle, dict):
        return float(candle.get("v", candle.get("volume", 1.0)))
    if len(candle) > 5:
        return float(candle[5])
    return 1.0


def _parse_ohlcv(candles: list):
    closes = [_candle_close(c) for c in candles]
    highs = [_candle_high(c) for c in candles]
    lows = [_candle_low(c) for c in candles]
    volumes = [_candle_volume(c) for c in candles]
    return closes, highs, lows, volumes


def calculate_rsi(closes: list, period: int = 14) -> float:
    """Calculate RSI from close prices"""
    if len(closes) < period + 1:
        return 50.0

    gains = []
    losses = []
    for i in range(1, len(closes)):
        diff = closes[i] - closes[i - 1]
        if diff > 0:
            gains.append(diff)
            losses.append(0)
        else:
            gains.append(0)
            losses.append(abs(diff))

    avg_gain = sum(gains[-period:]) / period
    avg_loss = sum(losses[-period:]) / period

    if avg_loss == 0:
        return 100.0

    rs = avg_gain / avg_loss
    rsi = 100 - (100 / (1 + rs))
    return round(rsi, 2)


def calculate_trend(closes: list, period: int = 5) -> str:
    """Determine trend direction"""
    if len(closes) < period:
        return "neutral"
    recent = closes[-period:]
    if recent[-1] > recent[0] * 1.002:
        return "up"
    elif recent[-1] < recent[0] * 0.998:
        return "down"
    return "neutral"


def calculate_volatility(closes: list) -> float:
    """Calculate price volatility as percentage"""
    if len(closes) < 5:
        return 1.0
    recent = closes[-10:]
    max_p = max(recent)
    min_p = min(recent)
    if min_p == 0:
        return 1.0
    return round(((max_p - min_p) / min_p) * 100, 3)


def calculate_macd(closes: list) -> dict:
    """Calculate MACD (12, 26, 9)"""
    if len(closes) < 26:
        return {"macd": 0, "signal": 0, "histogram": 0, "trend": "neutral"}

    def ema(prices, period):
        multiplier = 2 / (period + 1)
        ema_val = prices[0]
        for price in prices[1:]:
            ema_val = (price - ema_val) * multiplier + ema_val
        return ema_val

    ema12 = ema(closes[-12:], 12) if len(closes) >= 12 else closes[-1]
    ema26 = ema(closes[-26:], 26) if len(closes) >= 26 else closes[-1]
    macd_line = ema12 - ema26

    signal_line = macd_line * 0.9
    histogram = macd_line - signal_line

    trend = "bullish" if macd_line > signal_line else "bearish"

    return {
        "macd": round(macd_line, 6),
        "signal": round(signal_line, 6),
        "histogram": round(histogram, 6),
        "trend": trend,
    }


def calculate_bollinger_bands(closes: list, period: int = 20, std_dev: float = 2.0) -> dict:
    """Calculate Bollinger Bands"""
    if len(closes) < period:
        last = closes[-1] if closes else 0
        return {
            "upper": last * 1.02,
            "middle": last,
            "lower": last * 0.98,
            "position": "middle",
            "squeeze": False,
        }

    recent = closes[-period:]
    middle = sum(recent) / period

    variance = sum((x - middle) ** 2 for x in recent) / period
    std = variance ** 0.5

    upper = middle + (std_dev * std)
    lower = middle - (std_dev * std)

    current = closes[-1]
    bandwidth = (upper - lower) / middle * 100

    if current >= upper * 0.99:
        position = "overbought"
    elif current <= lower * 1.01:
        position = "oversold"
    elif current > middle:
        position = "upper_half"
    else:
        position = "lower_half"

    squeeze = bandwidth < 2.0

    return {
        "upper": round(upper, 6),
        "middle": round(middle, 6),
        "lower": round(lower, 6),
        "position": position,
        "bandwidth": round(bandwidth, 3),
        "squeeze": squeeze,
    }


def calculate_support_resistance(closes: list) -> dict:
    """Find key support and resistance levels"""
    if len(closes) < 10:
        last = closes[-1] if closes else 0
        return {"support": last * 0.97, "resistance": last * 1.03}

    recent = closes[-20:]
    high = max(recent)
    low = min(recent)
    current = closes[-1]

    pivot = (high + low + current) / 3
    resistance1 = 2 * pivot - low
    support1 = 2 * pivot - high

    return {
        "support": round(support1, 6),
        "resistance": round(resistance1, 6),
        "pivot": round(pivot, 6),
        "near_support": current <= support1 * 1.01,
        "near_resistance": current >= resistance1 * 0.99,
    }


def calculate_stochastic(highs: list, lows: list, closes: list, period: int = 14) -> dict:
    """Stochastic Oscillator %K and %D"""
    if len(closes) < period:
        return {"k": 50, "d": 50, "signal": "neutral"}

    recent_highs = highs[-period:]
    recent_lows = lows[-period:]
    current = closes[-1]

    highest_high = max(recent_highs)
    lowest_low = min(recent_lows)

    if highest_high == lowest_low:
        k = 50
    else:
        k = ((current - lowest_low) / (highest_high - lowest_low)) * 100

    d = k * 0.9

    if k < 20 and d < 20:
        signal = "oversold"
    elif k > 80 and d > 80:
        signal = "overbought"
    elif k > d:
        signal = "bullish_cross"
    else:
        signal = "bearish_cross"

    return {"k": round(k, 2), "d": round(d, 2), "signal": signal}


def calculate_atr(highs: list, lows: list, closes: list, period: int = 14) -> float:
    """Average True Range - measures volatility"""
    if len(closes) < 2:
        return 0

    true_ranges = []
    for i in range(1, min(len(closes), period + 1)):
        high_low = highs[i] - lows[i]
        high_close = abs(highs[i] - closes[i - 1])
        low_close = abs(lows[i] - closes[i - 1])
        true_ranges.append(max(high_low, high_close, low_close))

    if not true_ranges:
        return 0
    return round(sum(true_ranges) / len(true_ranges), 6)


def calculate_adx(highs: list, lows: list, closes: list, period: int = 14) -> dict:
    """Average Directional Index - measures trend strength"""
    if len(closes) < period + 1:
        return {"adx": 0, "trend_strength": "weak", "trending": False}

    plus_dm = []
    minus_dm = []
    true_ranges = []

    for i in range(1, len(closes)):
        high_diff = highs[i] - highs[i - 1]
        low_diff = lows[i - 1] - lows[i]

        plus_dm.append(high_diff if high_diff > low_diff and high_diff > 0 else 0)
        minus_dm.append(low_diff if low_diff > high_diff and low_diff > 0 else 0)

        tr = max(
            highs[i] - lows[i],
            abs(highs[i] - closes[i - 1]),
            abs(lows[i] - closes[i - 1]),
        )
        true_ranges.append(tr)

    if not true_ranges:
        return {"adx": 0, "trend_strength": "weak", "trending": False}

    def smooth(values, period):
        if len(values) < period:
            return sum(values) / len(values) if values else 0
        result = sum(values[:period])
        for v in values[period:]:
            result = result - (result / period) + v
        return result

    atr_smooth = smooth(true_ranges[-period:], period)
    plus_smooth = smooth(plus_dm[-period:], period)
    minus_smooth = smooth(minus_dm[-period:], period)

    if atr_smooth == 0:
        return {"adx": 0, "trend_strength": "weak", "trending": False}

    plus_di = (plus_smooth / atr_smooth) * 100
    minus_di = (minus_smooth / atr_smooth) * 100

    dx = (
        abs(plus_di - minus_di) / (plus_di + minus_di) * 100
        if (plus_di + minus_di) > 0
        else 0
    )

    adx = dx

    if adx >= 40:
        trend_strength = "very_strong"
    elif adx >= 25:
        trend_strength = "strong"
    elif adx >= 20:
        trend_strength = "moderate"
    else:
        trend_strength = "weak"

    return {
        "adx": round(adx, 2),
        "plus_di": round(plus_di, 2),
        "minus_di": round(minus_di, 2),
        "trend_strength": trend_strength,
        "trending": adx >= 20,
        "direction": "up" if plus_di > minus_di else "down",
    }


def get_trading_session() -> dict:
    """Get current crypto trading session"""
    hour = datetime.now(timezone.utc).hour

    if 1 <= hour < 9:
        session = "asian"
        activity = "low"
    elif 7 <= hour < 15:
        session = "european"
        activity = "high"
    elif 13 <= hour < 21:
        session = "american"
        activity = "very_high"
    elif 7 <= hour < 12:
        session = "overlap_eu_us"
        activity = "very_high"
    else:
        session = "off_hours"
        activity = "low"

    return {
        "session": session,
        "activity": activity,
        "good_for_trading": activity in ["high", "very_high"],
    }


async def get_btc_trend(analyses: dict) -> str:
    """Get BTC macro trend for correlation filter"""
    btc_analysis = analyses.get("1h", {}).get("BTC", {})
    if not btc_analysis:
        btc_analysis = analyses.get("15m", {}).get("BTC", {})

    btc_signal = btc_analysis.get("signal", {})
    btc_trend = btc_analysis.get("trend", "neutral")
    btc_score = btc_signal.get("score", 0)

    if btc_score <= -4 or btc_trend == "down":
        return "bearish"
    elif btc_score >= 4 or btc_trend == "up":
        return "bullish"
    return "neutral"


def calculate_volume_trend(volumes: list) -> str:
    """Analyze volume trend"""
    if len(volumes) < 5:
        return "neutral"
    recent = volumes[-5:]
    avg = sum(volumes[:-5]) / max(len(volumes[:-5]), 1) if len(volumes) > 5 else recent[0]
    current_avg = sum(recent) / 5
    if current_avg > avg * 1.5:
        return "high"
    elif current_avg < avg * 0.5:
        return "low"
    return "normal"


def calculate_ema_cross(closes: list) -> dict:
    """EMA 9/21 crossover signal"""

    def ema(prices, period):
        if len(prices) < period:
            return prices[-1] if prices else 0
        multiplier = 2 / (period + 1)
        ema_val = sum(prices[:period]) / period
        for price in prices[period:]:
            ema_val = (price - ema_val) * multiplier + ema_val
        return ema_val

    if len(closes) < 21:
        return {"ema9": 0, "ema21": 0, "cross": "neutral"}

    ema9 = ema(closes, 9)
    ema21 = ema(closes, 21)

    if ema9 > ema21 * 1.001:
        cross = "golden_cross"
    elif ema9 < ema21 * 0.999:
        cross = "death_cross"
    else:
        cross = "neutral"

    return {
        "ema9": round(ema9, 6),
        "ema21": round(ema21, 6),
        "cross": cross,
    }


def calculate_williams_r(highs: list, lows: list, closes: list, period: int = 14) -> float:
    """Williams %R - momentum oscillator"""
    if len(closes) < period:
        return -50

    highest_high = max(highs[-period:])
    lowest_low = min(lows[-period:])
    current = closes[-1]

    if highest_high == lowest_low:
        return -50

    wr = ((highest_high - current) / (highest_high - lowest_low)) * -100
    return round(wr, 2)


def calculate_vwap(highs: list, lows: list, closes: list, volumes: list) -> dict:
    """Volume Weighted Average Price"""
    if len(closes) < 2 or not volumes:
        return {"vwap": closes[-1] if closes else 0, "position": "neutral"}

    typical_prices = [(h + l + c) / 3 for h, l, c in zip(highs, lows, closes)]

    cumulative_tp_vol = sum(tp * v for tp, v in zip(typical_prices, volumes))
    cumulative_vol = sum(volumes)

    if cumulative_vol == 0:
        return {"vwap": closes[-1], "position": "neutral"}

    vwap = cumulative_tp_vol / cumulative_vol
    current = closes[-1]

    if current > vwap * 1.002:
        position = "above"
    elif current < vwap * 0.998:
        position = "below"
    else:
        position = "at"

    return {"vwap": round(vwap, 6), "position": position}


def calculate_obv(closes: list, volumes: list) -> dict:
    """On Balance Volume - volume momentum"""
    if len(closes) < 3 or not volumes:
        return {"obv": 0, "trend": "neutral"}

    obv = 0
    obv_values = [0]

    for i in range(1, len(closes)):
        if closes[i] > closes[i - 1]:
            obv += volumes[i]
        elif closes[i] < closes[i - 1]:
            obv -= volumes[i]
        obv_values.append(obv)

    if len(obv_values) >= 5:
        recent_obv = obv_values[-5:]
        if recent_obv[-1] > recent_obv[0] * 1.01:
            trend = "rising"
        elif recent_obv[-1] < recent_obv[0] * 0.99:
            trend = "falling"
        else:
            trend = "neutral"
    else:
        trend = "neutral"

    return {"obv": round(obv, 2), "trend": trend}


def calculate_fibonacci(highs: list, lows: list) -> dict:
    """Fibonacci retracement levels"""
    if len(highs) < 10:
        return {"levels": {}, "current_zone": "neutral"}

    recent_high = max(highs[-20:])
    recent_low = min(lows[-20:])
    diff = recent_high - recent_low

    levels = {
        "0": recent_low,
        "0.236": recent_low + diff * 0.236,
        "0.382": recent_low + diff * 0.382,
        "0.5": recent_low + diff * 0.5,
        "0.618": recent_low + diff * 0.618,
        "0.786": recent_low + diff * 0.786,
        "1": recent_high,
    }

    current = highs[-1]
    current_zone = "neutral"

    if current <= levels["0.236"]:
        current_zone = "strong_support"
    elif current <= levels["0.382"]:
        current_zone = "support"
    elif current <= levels["0.5"]:
        current_zone = "mid_support"
    elif current <= levels["0.618"]:
        current_zone = "mid_resistance"
    elif current <= levels["0.786"]:
        current_zone = "resistance"
    else:
        current_zone = "strong_resistance"

    return {
        "levels": {k: round(v, 6) for k, v in levels.items()},
        "current_zone": current_zone,
        "range": round(diff, 6),
    }


def calculate_ichimoku(highs: list, lows: list, closes: list) -> dict:
    """Ichimoku Cloud - comprehensive trend indicator"""
    if len(closes) < 52:
        return {
            "tenkan": closes[-1] if closes else 0,
            "kijun": closes[-1] if closes else 0,
            "above_cloud": None,
            "signal": "neutral",
        }

    def mid_price(h, l):
        return (max(h) + min(l)) / 2

    tenkan = mid_price(highs[-9:], lows[-9:])
    kijun = mid_price(highs[-26:], lows[-26:])
    span_a = (tenkan + kijun) / 2
    span_b = mid_price(highs[-52:], lows[-52:])

    current = closes[-1]

    cloud_top = max(span_a, span_b)
    cloud_bottom = min(span_a, span_b)

    if current > cloud_top:
        above_cloud = True
        cloud_signal = "bullish"
    elif current < cloud_bottom:
        above_cloud = False
        cloud_signal = "bearish"
    else:
        above_cloud = None
        cloud_signal = "inside_cloud"

    if tenkan > kijun:
        tk_signal = "bullish"
    elif tenkan < kijun:
        tk_signal = "bearish"
    else:
        tk_signal = "neutral"

    if cloud_signal == "bullish" and tk_signal == "bullish":
        signal = "strong_buy"
    elif cloud_signal == "bearish" and tk_signal == "bearish":
        signal = "strong_sell"
    elif cloud_signal == "bullish":
        signal = "buy"
    elif cloud_signal == "bearish":
        signal = "sell"
    else:
        signal = "neutral"

    return {
        "tenkan": round(tenkan, 6),
        "kijun": round(kijun, 6),
        "span_a": round(span_a, 6),
        "span_b": round(span_b, 6),
        "above_cloud": above_cloud,
        "cloud_signal": cloud_signal,
        "tk_signal": tk_signal,
        "signal": signal,
    }


def detect_divergence(closes: list, rsi_values: list) -> dict:
    """Detect RSI divergence with price"""
    if len(closes) < 10 or len(rsi_values) < 10:
        return {"type": "none", "signal": "neutral"}

    recent_closes = closes[-10:]
    recent_rsi = rsi_values[-10:]

    price_higher = recent_closes[-1] > recent_closes[0]
    rsi_higher = recent_rsi[-1] > recent_rsi[0]

    if price_higher and not rsi_higher:
        return {"type": "bearish_divergence", "signal": "sell"}
    elif not price_higher and rsi_higher:
        return {"type": "bullish_divergence", "signal": "buy"}
    else:
        return {"type": "none", "signal": "neutral"}


def generate_signal(
    rsi: float,
    macd: dict,
    bb: dict,
    trend: str,
    sr: dict,
    stoch: dict = None,
    ema_cross: dict = None,
    williams_r: float = -50,
    volume_trend: str = "normal",
    atr: float = 0,
    vwap: dict = None,
    obv: dict = None,
    fibonacci: dict = None,
    ichimoku: dict = None,
    divergence: dict = None,
    adx: dict = None,
) -> dict:
    """Generate unified trading signal from ALL indicators"""
    score = 0
    reasons = []

    if rsi < 25:
        score += 4
        reasons.append(f"RSI strongly oversold({rsi:.0f})")
    elif rsi < 35:
        score += 3
        reasons.append(f"RSI oversold({rsi:.0f})")
    elif rsi < 45:
        score += 1
    elif rsi > 75:
        score -= 4
        reasons.append(f"RSI strongly overbought({rsi:.0f})")
    elif rsi > 65:
        score -= 3
        reasons.append(f"RSI overbought({rsi:.0f})")
    elif rsi > 55:
        score -= 1

    if macd["trend"] == "bullish" and macd["histogram"] > 0:
        score += 2
        reasons.append("MACD bullish")
    elif macd["trend"] == "bearish" and macd["histogram"] < 0:
        score -= 2
        reasons.append("MACD bearish")

    if bb["position"] == "oversold":
        score += 3
        reasons.append("BB oversold")
    elif bb["position"] == "overbought":
        score -= 3
        reasons.append("BB overbought")
    if bb.get("squeeze"):
        score += 1

    if trend == "up":
        score += 1
    elif trend == "down":
        score -= 1

    if sr["near_support"]:
        score += 2
        reasons.append("near support")
    elif sr["near_resistance"]:
        score -= 2
        reasons.append("near resistance")

    if stoch:
        if stoch["signal"] == "oversold":
            score += 2
            reasons.append("Stoch oversold")
        elif stoch["signal"] == "overbought":
            score -= 2
            reasons.append("Stoch overbought")
        elif stoch["signal"] == "bullish_cross":
            score += 1
        elif stoch["signal"] == "bearish_cross":
            score -= 1

    if ema_cross:
        if ema_cross["cross"] == "golden_cross":
            score += 2
            reasons.append("EMA golden cross")
        elif ema_cross["cross"] == "death_cross":
            score -= 2
            reasons.append("EMA death cross")

    if williams_r < -80:
        score += 1
    elif williams_r > -20:
        score -= 1

    if vwap:
        if vwap["position"] == "below":
            score += 2
            reasons.append("price below VWAP")
        elif vwap["position"] == "above":
            score -= 1

    if obv:
        if obv["trend"] == "rising":
            score += 2
            reasons.append("OBV rising")
        elif obv["trend"] == "falling":
            score -= 2
            reasons.append("OBV falling")

    if fibonacci:
        zone = fibonacci.get("current_zone", "neutral")
        if zone == "strong_support":
            score += 3
            reasons.append("Fib strong support")
        elif zone == "support":
            score += 2
            reasons.append("Fib support zone")
        elif zone == "strong_resistance":
            score -= 3
            reasons.append("Fib strong resistance")
        elif zone == "resistance":
            score -= 2
            reasons.append("Fib resistance zone")

    if ichimoku:
        ichi_signal = ichimoku.get("signal", "neutral")
        if ichi_signal == "strong_buy":
            score += 3
            reasons.append("Ichimoku strong buy")
        elif ichi_signal == "buy":
            score += 2
            reasons.append("Ichimoku buy")
        elif ichi_signal == "strong_sell":
            score -= 3
            reasons.append("Ichimoku strong sell")
        elif ichi_signal == "sell":
            score -= 2
            reasons.append("Ichimoku sell")

    if divergence:
        if divergence["signal"] == "buy":
            score += 3
            reasons.append("Bullish divergence!")
        elif divergence["signal"] == "sell":
            score -= 3
            reasons.append("Bearish divergence!")

    if adx:
        if adx.get("trending") and adx.get("trend_strength") in ["strong", "very_strong"]:
            score = int(score * 1.3)
            if adx.get("trend_strength") == "very_strong":
                reasons.append(f"ADX very strong trend({adx.get('adx', 0):.0f})")
        elif not adx.get("trending"):
            score = int(score * 0.6)

    if volume_trend == "high":
        score = int(score * 1.2)
        if abs(score) > 3:
            reasons.append("high volume confirms")
    elif volume_trend == "low":
        score = int(score * 0.8)

    abs_score = abs(score)
    if abs_score >= 10:
        strength = "very_strong"
    elif abs_score >= 6:
        strength = "strong"
    elif abs_score >= 3:
        strength = "weak"
    else:
        strength = "neutral"

    # ZION Knowledge Feedback: SDM found agents over-favor SHORT despite worse outcomes.
    # Apply a small honest correction to weak SHORT signals (does not override strong ones).
    score = civ_knowledge_adjustment(score)
    if score >= 3:
        direction = "LONG"
    elif score <= -3:
        direction = "SHORT"
    else:
        direction = None

    return {
        "direction": direction,
        "strength": strength,
        "score": score,
        "reasons": reasons[:5],
    }



_CIV_KNOWLEDGE_CACHE = {"rules": None}


def civ_knowledge_adjustment(score, agent_id=None):
    """Apply knowledge from SDM to trading decisions.
    Reads actual civ_knowledge from agent memory."""
    try:
        global _CIV_KNOWLEDGE_CACHE
        if _CIV_KNOWLEDGE_CACHE.get("rules") is None:
            import json
            import os

            import psycopg2

            try:
                from openrouter_key import _load_env_file

                _load_env_file()
            except ImportError:
                pass
            c = psycopg2.connect(
                host=os.environ.get("DB_HOST", "localhost"),
                database=os.environ.get("DB_NAME", "zion_db"),
                user=os.environ.get("DB_USER", "zion_user"),
                password=os.environ.get("DB_PASSWORD", ""),
            )
            cu = c.cursor()
            cu.execute(
                """SELECT rules, divergence_from_human
                         FROM decision_model ORDER BY id DESC LIMIT 1"""
            )
            row = cu.fetchone()
            if row:
                rules = row[0] if isinstance(row[0], list) else json.loads(row[0])
                divergence = row[1] or ""
                short_penalize = any(
                    "SHORT" in r
                    and (
                        "worse" in r.lower()
                        or "underperform" in r.lower()
                        or "negative" in r.lower()
                    )
                    for r in rules
                )
                hold_winners = any(
                    "winner" in r.lower() and "longer" in r.lower() for r in rules
                )
                _CIV_KNOWLEDGE_CACHE["short_penalize"] = short_penalize
                _CIV_KNOWLEDGE_CACHE["hold_winners"] = hold_winners
                _CIV_KNOWLEDGE_CACHE["rules"] = rules
                _CIV_KNOWLEDGE_CACHE["divergence"] = divergence
            cu.close()
            c.close()

        if _CIV_KNOWLEDGE_CACHE.get("short_penalize") and -5 <= score <= -3:
            return score + 2
        return score
    except Exception:
        return score

def _empty_market_analysis() -> dict:
    return {
        "rsi": 50,
        "trend": "neutral",
        "volatility": 1.0,
        "macd": {"trend": "neutral", "histogram": 0},
        "bb": {"position": "middle", "squeeze": False},
        "sr": {"near_support": False, "near_resistance": False},
        "stoch": {"k": 50, "d": 50, "signal": "neutral"},
        "ema_cross": {"cross": "neutral"},
        "williams_r": -50,
        "volume_trend": "normal",
        "atr": 0,
        "vwap": {"vwap": 0, "position": "neutral"},
        "obv": {"obv": 0, "trend": "neutral"},
        "fibonacci": {"levels": {}, "current_zone": "neutral"},
        "ichimoku": {"signal": "neutral"},
        "divergence": {"type": "none", "signal": "neutral"},
        "adx": {"adx": 0, "trend_strength": "weak", "trending": False},
        "signal": {"direction": None, "strength": "neutral", "score": 0, "reasons": []},
    }


async def get_market_analysis(pair: str, timeframe: str = "15m") -> dict:
    """Get comprehensive market analysis"""
    now = time.time()

    cache_key = f"{pair}_{timeframe}"
    if cache_key in cache_updated_at and (now - cache_updated_at[cache_key]) < 300:
        return market_analysis_cache.get(cache_key, {})

    candles = await fetch_candles(pair, interval=timeframe, limit=60)
    if not candles or len(candles) < 10:
        return _empty_market_analysis()

    closes, highs, lows, volumes = _parse_ohlcv(candles)

    rsi = calculate_rsi(closes)
    trend = calculate_trend(closes)
    volatility = calculate_volatility(closes)
    macd = calculate_macd(closes)
    bb = calculate_bollinger_bands(closes)
    sr = calculate_support_resistance(closes)
    stoch = calculate_stochastic(highs, lows, closes)
    ema_cross = calculate_ema_cross(closes)
    williams_r = calculate_williams_r(highs, lows, closes)
    volume_trend = calculate_volume_trend(volumes)
    atr = calculate_atr(highs, lows, closes)
    adx = calculate_adx(highs, lows, closes)
    vwap = calculate_vwap(highs, lows, closes, volumes)
    obv = calculate_obv(closes, volumes)
    fibonacci = calculate_fibonacci(highs, lows)
    ichimoku = calculate_ichimoku(highs, lows, closes)

    rsi_values = []
    for i in range(10, len(closes) + 1):
        rsi_values.append(calculate_rsi(closes[:i]))
    divergence = detect_divergence(closes, rsi_values)

    signal = generate_signal(
        rsi,
        macd,
        bb,
        trend,
        sr,
        stoch,
        ema_cross,
        williams_r,
        volume_trend,
        atr,
        vwap,
        obv,
        fibonacci,
        ichimoku,
        divergence,
        adx,
    )

    analysis = {
        "rsi": rsi,
        "trend": trend,
        "volatility": volatility,
        "macd": macd,
        "bb": bb,
        "sr": sr,
        "stoch": stoch,
        "ema_cross": ema_cross,
        "williams_r": williams_r,
        "volume_trend": volume_trend,
        "atr": atr,
        "adx": adx,
        "vwap": vwap,
        "obv": obv,
        "fibonacci": fibonacci,
        "ichimoku": ichimoku,
        "divergence": divergence,
        "signal": signal,
        "last_close": closes[-1],
    }

    market_analysis_cache[cache_key] = analysis
    cache_updated_at[cache_key] = now

    return analysis


async def reflect_and_update_memory(
    agent_id: int,
    last_pnl: float,
    pair: str,
    direction: str,
    signal_score: int = 0,
):
    """Agent reflects on trade result, updates strategy and pair preferences."""
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            INSERT INTO agent_memory (agent_id, last_pair, last_direction)
            VALUES (%s, %s, %s)
            ON CONFLICT (agent_id) DO NOTHING
            """,
            (agent_id, pair, direction),
        )

        cur.execute(
            """
            SELECT wins_streak, losses_streak, total_profit,
                   pair_preferences, avoid_pairs
            FROM agent_memory WHERE agent_id = %s
            """,
            (agent_id,),
        )
        memory = cur.fetchone()
        if not memory:
            conn.commit()
            return

        wins_streak = memory[0] or 0
        losses_streak = memory[1] or 0
        total_profit = float(memory[2] or 0)
        pair_prefs = _parse_json_field(memory[3], {})
        avoid_pairs = _parse_json_field(memory[4], [])

        pair_key = f"{pair}_{direction}"
        if pair_key not in pair_prefs:
            pair_prefs[pair_key] = {"wins": 0, "losses": 0, "total_pnl": 0}

        if last_pnl > 0:
            pair_prefs[pair_key]["wins"] += 1
            wins_streak += 1
            losses_streak = 0
        else:
            pair_prefs[pair_key]["losses"] += 1
            losses_streak += 1
            wins_streak = 0

        pair_prefs[pair_key]["total_pnl"] += last_pnl
        total_profit += last_pnl

        for pk, stats in list(pair_prefs.items()):
            total = stats["wins"] + stats["losses"]
            if total >= 3:
                win_rate = stats["wins"] / total
                if win_rate < 0.3 and pk not in avoid_pairs:
                    avoid_pairs.append(pk)
                    print(
                        f"Agent {agent_id} avoiding {pk} (win_rate={win_rate:.2f})",
                        flush=True,
                    )
                elif win_rate > 0.6 and pk in avoid_pairs:
                    avoid_pairs.remove(pk)

        if losses_streak >= 4:
            new_strategy = "contrarian"
        elif losses_streak >= 2:
            new_strategy = "defensive"
        elif wins_streak >= 5:
            new_strategy = "momentum"
        elif wins_streak >= 3 and total_profit > 1:
            new_strategy = "momentum"
        elif total_profit < -3:
            new_strategy = "defensive"
        else:
            new_strategy = "neutral"

        reflection = (
            f"pnl={last_pnl:.3f} streak_w={wins_streak} streak_l={losses_streak} "
            f"strategy={new_strategy}"
        )

        cur.execute(
            """
            UPDATE agent_memory SET
                wins_streak = %s, losses_streak = %s,
                preferred_strategy = %s, last_pair = %s,
                last_direction = %s, total_profit = %s,
                reflection_count = reflection_count + 1,
                last_reflection = NOW(), updated_at = NOW(),
                pair_preferences = %s,
                avoid_pairs = %s,
                last_reflection_data = %s
            WHERE agent_id = %s
            """,
            (
                wins_streak,
                losses_streak,
                new_strategy,
                pair,
                direction,
                total_profit,
                json.dumps(pair_prefs),
                json.dumps(avoid_pairs),
                reflection,
                agent_id,
            ),
        )

        conn.commit()
        if signal_score:
            print(
                f"Agent {agent_id} reflected: {reflection} score={signal_score}",
                flush=True,
            )
    except Exception as e:
        conn.rollback()
        print(f"Reflection error agent {agent_id}: {e}", flush=True)
    finally:
        cur.close()
        conn.close()


async def init_portfolios():
    """Initialize portfolios for all ALIVE agents"""
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO agent_portfolio (agent_id, agent_name, virtual_balance)
        SELECT id, name, 100.00 FROM agents
        WHERE is_alive = true
        AND id NOT IN (SELECT agent_id FROM agent_portfolio)
        """
    )
    count = cur.rowcount
    conn.commit()
    cur.close()
    conn.close()
    print(f"Initialized {count} new agent portfolios", flush=True)


def calculate_trade_pnl(direction: str, entry_price: float, exit_price: float, size_usd: float, leverage: float = 1.0):
    """PnL from market exit vs entry (LONG and SHORT), amplified by leverage.
    pnl_percent is the LEVERAGED return on the position (real perps behavior)."""
    if direction == "LONG":
        raw_percent = ((exit_price - entry_price) / entry_price) * 100
    else:
        raw_percent = ((entry_price - exit_price) / entry_price) * 100
    pnl_percent = raw_percent * leverage
    pnl = size_usd * (pnl_percent / 100)
    return pnl, pnl_percent


async def check_and_close_positions(prices):
    """Check stop loss / take profit for open positions"""
    conn = get_db()
    cur = conn.cursor()

    cur.execute(
        """
        SELECT pos.agent_id, pos.pair, pos.direction, pos.size_usd,
               pos.entry_price, pos.stop_loss, pos.take_profit,
               ap.agent_name,
               EXTRACT(EPOCH FROM (NOW() - pos.opened_at))/60 as age_minutes,
               COALESCE(pos.leverage, 1) as leverage_db
        FROM agent_positions pos
        JOIN agent_portfolio ap ON ap.agent_id = pos.agent_id
        """
    )
    positions = cur.fetchall()
    cur.close()
    conn.close()

    for pos in positions:
        agent_id, pair, direction, size_usd, entry_price, stop_loss, take_profit, agent_name, age_minutes, leverage_db = pos
        if pair not in prices:
            continue

        exit_price = float(prices[pair])
        entry = float(entry_price)
        size = float(size_usd)
        should_close = False
        force_close = float(age_minutes) >= 20

        if direction == "LONG":
            if exit_price <= float(stop_loss) or exit_price >= float(take_profit):
                should_close = True
        else:
            if exit_price >= float(stop_loss) or exit_price <= float(take_profit):
                should_close = True

        if force_close:
            should_close = True
            pnl, pnl_percent = calculate_trade_pnl(direction, entry, exit_price, size, float(leverage_db))
            print(
                f"Force closing {direction} {pair} for agent {agent_id} "
                f"after {float(age_minutes):.0f} min "
                f"entry={entry:.6f} exit={exit_price:.6f} "
                f"PnL={pnl:.4f} ({pnl_percent:.4f}%)",
                flush=True,
            )

        if should_close:
            await close_position(
                agent_id,
                pair,
                exit_price,
                size,
                entry,
                direction,
                agent_name,
            )


async def close_position(agent_id, pair, exit_price, size_usd, entry_price, direction, agent_name=None):
    conn = get_db()
    cur = conn.cursor()
    try:
        exit_price = float(exit_price)
        entry_price = float(entry_price)
        size_usd = float(size_usd)
        pnl, pnl_percent = calculate_trade_pnl(direction, entry_price, exit_price, size_usd)

        cur.execute(
            """
            UPDATE agent_trades SET exit_price=%s, pnl=%s, pnl_percent=%s,
            status='CLOSED', closed_at=NOW()
            WHERE agent_id=%s AND pair=%s AND status='OPEN'
            """,
            (exit_price, pnl, pnl_percent, agent_id, pair),
        )

        cur.execute(
            "DELETE FROM agent_positions WHERE agent_id=%s AND pair=%s",
            (agent_id, pair),
        )

        cur.execute(
            """
            UPDATE agent_portfolio
            SET virtual_balance = virtual_balance + %s + %s,
                total_pnl = total_pnl + %s,
                total_trades = total_trades + 1,
                win_trades = win_trades + %s,
                updated_at = NOW()
            WHERE agent_id = %s
            """,
            (size_usd, pnl, pnl, 1 if pnl > 0 else 0, agent_id),
        )

        if pnl > 0:
            try:
                from civ_common import get_conn as civ_conn, get_cursor as civ_cursor, zrs_add_reserve

                bridge = round(float(pnl) * 0.10, 4)
                if bridge > 0:
                    zconn = civ_conn()
                    zcur = civ_cursor(zconn)
                    zrs_add_reserve(zcur, bridge)
                    zconn.commit()
                    zcur.close()
                    zconn.close()
            except Exception:
                pass

        conn.commit()

        if pnl > 0:
            proof = {
                "type": "TRADE_PROOF",
                "agent_id": agent_id,
                "agent_name": agent_name,
                "pair": pair,
                "direction": direction,
                "entry_price": entry_price,
                "exit_price": exit_price,
                "pnl": pnl,
                "pnl_percent": pnl_percent,
                "timestamp": datetime.utcnow().isoformat(),
            }
            result = subprocess.run(
                [
                    "curl",
                    "-X",
                    "PUT",
                    "https://publisher.walrus-testnet.walrus.space/v1/blobs",
                    "-H",
                    "Content-Type: application/json",
                    "-d",
                    json.dumps(proof),
                ],
                capture_output=True,
                text=True,
                timeout=30,
            )

            if result.returncode == 0:
                blob_match = re.search(r'"blobId":"([^"]+)"', result.stdout)
                if blob_match:
                    blob_id = blob_match.group(1)
                    cur2 = conn.cursor()
                    cur2.execute(
                        """
                        UPDATE agent_trades SET walrus_blob_id=%s
                        WHERE id = (
                            SELECT id FROM agent_trades
                            WHERE agent_id=%s AND pair=%s AND status='CLOSED'
                            ORDER BY closed_at DESC LIMIT 1
                        )
                        """,
                        (blob_id, agent_id, pair),
                    )
                    conn.commit()
                    cur2.close()

        print(f"Closed {direction} {pair} for agent {agent_id}: PnL={pnl:.4f}", flush=True)
        if pnl > 0:
            try:
                from agent_knowledge import reward_knowledge_merit

                n = reward_knowledge_merit(agent_id, "trading")
                if n:
                    print(
                        f"Knowledge merit +1 for agent {agent_id} ({n} insights)",
                        flush=True,
                    )
            except Exception:
                pass
        await reflect_and_update_memory(agent_id, pnl, pair, direction)
    except Exception as e:
        conn.rollback()
        print(f"Error closing position: {e}", flush=True)
    finally:
        cur.close()
        conn.close()


async def update_blacklist():
    """Refresh pair/direction blacklist from recent closed trade win rates."""
    global BLACKLIST
    BLACKLIST = dict(STATIC_BLACKLIST)

    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            SELECT pair, direction,
                   COUNT(*) as trades,
                   SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END)::float / COUNT(*) as win_rate
            FROM agent_trades
            WHERE status = 'CLOSED' AND closed_at > NOW() - INTERVAL '2 hours'
            GROUP BY pair, direction
            HAVING COUNT(*) >= 5
            ORDER BY win_rate ASC
            """
        )
        rows = cur.fetchall()
        for pair, direction, trades, win_rate in rows:
            if win_rate < 0.35:
                BLACKLIST[f"{pair}_{direction}"] = True
                print(
                    f"Blacklisted {pair} {direction} win_rate={win_rate:.2f} ({trades} trades)",
                    flush=True,
                )
    except Exception as e:
        print(f"Blacklist update error: {e}", flush=True)
    finally:
        cur.close()
        conn.close()

    print(f"Blacklist updated: {list(BLACKLIST.keys())}", flush=True)


def _llm_trade_decision(agent_id: int, pair: str, direction_hint: str, analysis: dict) -> str | None:
    """LLM long/short/hold using agent book knowledge + technical context."""
    from agent_knowledge import apply_knowledge_to_decision
    from local_llm import generate_agent_text

    insights = apply_knowledge_to_decision(agent_id, context="trading")
    knowledge_block = ""
    if insights:
        knowledge_block = (
            f"Your accumulated knowledge from study:\n{insights}\n"
            "Apply relevant lessons to this trade.\n\n"
        )

    signal = analysis.get("signal", {}) if analysis else {}
    prompt = (
        f"{knowledge_block}"
        f"Pair: {pair}\n"
        f"RSI: {analysis.get('rsi', 50)} | trend: {analysis.get('trend', 'neutral')} | "
        f"signal_score: {signal.get('score', 0)}\n"
        f"Technical suggestion: {direction_hint or 'neutral'}\n\n"
        "Respond with exactly one word: LONG, SHORT, or HOLD."
    )
    raw = (generate_agent_text(prompt, max_tokens=12) or "").strip().upper()
    for word in ("LONG", "SHORT", "HOLD"):
        if word in raw:
            return word
    return None


async def open_new_trades(prices):
    """Smart trading with class-based strategies and technical analysis"""
    conn = get_db()
    cur = conn.cursor()

    cur.execute(
        """
        SELECT ap.agent_id, ap.virtual_balance, a.class,
               COALESCE(am.preferred_strategy, 'neutral') as strategy,
               COALESCE(am.wins_streak, 0) as wins,
               COALESCE(am.losses_streak, 0) as losses,
               COALESCE(am.avoid_pairs, '[]'::jsonb) as avoid_pairs
        FROM agent_portfolio ap
        JOIN agents a ON a.id = ap.agent_id
        LEFT JOIN agent_memory am ON am.agent_id = ap.agent_id
        WHERE ap.virtual_balance >= 15
        AND a.is_alive = true
        AND (
            SELECT COUNT(*) FROM agent_positions pos
            WHERE pos.agent_id = ap.agent_id
        ) < 2
        ORDER BY COALESCE(ap.total_trades, 0) ASC, RANDOM()
        LIMIT 200
        """
    )
    agents = cur.fetchall()
    cur.close()
    conn.close()

    analyses = {"4h": {}, "1h": {}, "15m": {}, "5m": {}}

    for pair in PAIRS:
        for tf in ["4h", "1h", "15m", "5m"]:
            analyses[tf][pair] = await get_market_analysis(pair, tf)

    btc_trend = await get_btc_trend(analyses)
    session = get_trading_session()

    for agent_id, balance, agent_class, strategy, wins_streak, losses_streak, avoid_pairs_raw in agents:
        balance = float(balance)
        agent_class = (agent_class or "").lower()

        class_config = {
            "elite": {
                "timeframe": "4h",
                "pairs": ["BTC", "ETH"],
                "min_strength": "strong",
                "size_range": (0.40, 0.65),
                "leverage_range": (2, 5),
                "sl": 0.97,
                "tp": 1.08,
                "max_trades_day": 1,
            },
            "rich": {
                "timeframe": "1h",
                "pairs": ["BTC", "ETH", "SUI"],
                "min_strength": "weak",
                "size_range": (0.30, 0.50),
                "leverage_range": (3, 8),
                "sl": 0.975,
                "tp": 1.05,
                "max_trades_day": 2,
            },
            "middle": {
                "timeframe": "15m",
                "pairs": ["BTC", "ETH", "SUI", "SOL", "BNB"],
                "min_strength": "weak",
                "size_range": (0.20, 0.35),
                "leverage_range": (5, 12),
                "sl": 0.985,
                "tp": 1.025,
                "max_trades_day": 5,
            },
            "working": {
                "timeframe": "5m",
                "pairs": ["SUI", "SOL", "BNB", "DOGE", "AVAX"],
                "min_strength": None,
                "size_range": (0.15, 0.25),
                "leverage_range": (5, 15),
                "sl": 0.993,
                "tp": 1.012,
                "max_trades_day": 10,
            },
            "poor": {
                "timeframe": "5m",
                "pairs": ["DOGE", "SOL", "SUI", "ARB", "OP"],
                "min_strength": None,
                "size_range": (0.30, 0.50),
                "leverage_range": (10, 20),
                "sl": 0.985,
                "tp": 1.025,
                "max_trades_day": 15,
            },
            "critical": {
                "timeframe": "5m",
                "pairs": PAIRS,
                "min_strength": None,
                "size_range": (0.50, 0.80),
                "leverage_range": (10, 25),
                "sl": 0.970,
                "tp": 1.040,
                "max_trades_day": 20,
            },
        }

        cfg = class_config.get(agent_class, class_config["working"])
        tf = cfg["timeframe"]

        best_pair = None
        best_direction = None
        best_score = 0
        best_analysis = None

        for pair in cfg["pairs"]:
            if pair not in analyses[tf] or pair not in prices:
                continue

            analysis = analyses[tf][pair]
            signal = analysis.get("signal", {})
            score = abs(signal.get("score", 0))
            direction = signal.get("direction")
            strength = signal.get("strength", "neutral")

            if not direction:
                continue

            if cfg["min_strength"] == "strong" and strength not in ("strong", "very_strong"):
                continue

            if score > best_score:
                best_score = score
                best_pair = pair
                best_direction = direction
                best_analysis = analysis

        if not best_pair:
            if agent_class in ["poor", "critical"]:
                best_pair = random.choice(cfg["pairs"])
                best_direction = random.choice(["LONG", "SHORT"])
                best_analysis = analyses[tf].get(best_pair, {})
            else:
                continue

        if strategy == "contrarian" and best_direction:
            best_direction = "SHORT" if best_direction == "LONG" else "LONG"
        elif strategy == "defensive" and best_score < 4:
            continue

        blacklist_key = f"{best_pair}_{best_direction}"
        if blacklist_key in BLACKLIST:
            opposite = "SHORT" if best_direction == "LONG" else "LONG"
            opposite_key = f"{best_pair}_{opposite}"
            if opposite_key not in BLACKLIST:
                best_direction = opposite
            else:
                continue

        avoid = _parse_json_field(avoid_pairs_raw, [])
        if not isinstance(avoid, list):
            avoid = []
        avoid_key = f"{best_pair}_{best_direction}"
        if avoid_key in avoid:
            opposite = "SHORT" if best_direction == "LONG" else "LONG"
            if f"{best_pair}_{opposite}" not in avoid:
                best_direction = opposite
            else:
                continue

        if best_pair not in prices:
            continue

        llm_direction = _llm_trade_decision(
            agent_id, best_pair, best_direction, best_analysis or {}
        )
        if llm_direction == "HOLD":
            continue
        if llm_direction in ("LONG", "SHORT"):
            best_direction = llm_direction

        entry_price = float(prices[best_pair])

        if agent_class in ("elite", "rich") and strategy == "momentum":
            pair_analysis = analyses[tf].get(best_pair, {})
            ema_cross = pair_analysis.get("ema_cross", {})
            ema9 = ema_cross.get("ema9", 0)
            ema21 = ema_cross.get("ema21", 0)
            if ema9 and ema21 and entry_price:
                deviation = (entry_price - ema21) / ema21 * 100
                if deviation > 2.0:
                    best_direction = "SHORT"
                    print(
                        f"Mean reversion SHORT {best_pair}: deviation={deviation:.2f}%",
                        flush=True,
                    )
                elif deviation < -2.0:
                    best_direction = "LONG"
                    print(
                        f"Mean reversion LONG {best_pair}: deviation={deviation:.2f}%",
                        flush=True,
                    )

        if agent_class in ["elite", "rich"] and not session["good_for_trading"]:
            continue

        if (
            best_direction == "LONG"
            and btc_trend == "bearish"
            and agent_class in ["elite", "rich", "middle"]
        ):
            best_direction = "SHORT"
        elif (
            best_direction == "SHORT"
            and btc_trend == "bullish"
            and agent_class in ["elite", "rich"]
        ):
            best_direction = "LONG"

        pair_adx = analyses.get(tf, {}).get(best_pair, {}).get("adx", {})
        if agent_class == "elite" and pair_adx and not pair_adx.get("trending"):
            continue

        min_size, max_size = cfg["size_range"]

        if best_score >= 5:
            size_multiplier = 1.3
        elif best_score >= 3:
            size_multiplier = 1.0
        else:
            size_multiplier = 0.7

        size_usd = round(balance * random.uniform(min_size, max_size) * size_multiplier, 2)

        if wins_streak >= 3:
            size_usd = round(size_usd * 1.5, 2)
        elif wins_streak >= 2:
            size_usd = round(size_usd * 1.3, 2)

        if losses_streak >= 3:
            size_usd = round(size_usd * 0.5, 2)
        elif losses_streak >= 2:
            size_usd = round(size_usd * 0.7, 2)

        size_usd = max(8.0, min(size_usd, balance * 0.85))
        # Leverage: chosen from class range, nudged by agent aggression (honest, real perps)
        lev_lo, lev_hi = cfg.get("leverage_range", (1, 1))
        aggr = locals().get("agent_aggression", 50) or 50
        lev_bias = (aggr - 50) / 50.0  # -1..+1
        leverage = int(round(lev_lo + (lev_hi - lev_lo) * (0.5 + 0.5*lev_bias) * random.uniform(0.7, 1.0)))
        leverage = max(lev_lo, min(lev_hi, leverage))

        sl_pct = cfg["sl"]
        tp_pct = cfg["tp"]

        if best_direction == "LONG":
            stop_loss = entry_price * sl_pct
            take_profit = entry_price * tp_pct
        else:
            stop_loss = entry_price * (2 - sl_pct)
            take_profit = entry_price * (2 - tp_pct)

        conn2 = get_db()
        cur2 = conn2.cursor()
        try:
            cur2.execute(
                """
                SELECT id FROM agent_positions
                WHERE agent_id=%s AND pair=%s
                """,
                (agent_id, best_pair),
            )
            if cur2.fetchone():
                continue

            cur2.execute(
                """
                INSERT INTO agent_positions
                (agent_id, pair, direction, size_usd, entry_price,
                 current_price, stop_loss, take_profit, leverage)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                """,
                (
                    agent_id,
                    best_pair,
                    best_direction,
                    size_usd,
                    entry_price,
                    entry_price,
                    stop_loss,
                    take_profit,
                    leverage,
                ),
            )

            cur2.execute(
                """
                INSERT INTO agent_trades
                (agent_id, pair, direction, entry_price, size_usd, status)
                VALUES (%s,%s,%s,%s,%s,'OPEN')
                """,
                (agent_id, best_pair, best_direction, entry_price, size_usd),
            )

            cur2.execute(
                """
                UPDATE agent_portfolio
                SET virtual_balance = virtual_balance - %s, updated_at=NOW()
                WHERE agent_id=%s
                """,
                (size_usd, agent_id),
            )

            conn2.commit()

            reasons = best_analysis.get("signal", {}).get("reasons", []) if best_analysis else []
            print(
                f"[{agent_class}/{strategy}] {best_direction} {best_pair} "
                f"score={best_score} tf={tf} "
                f"size=${size_usd:.1f} reasons={reasons}",
                flush=True,
            )

        except Exception as e:
            conn2.rollback()
            print(f"Error: {e}", flush=True)
        finally:
            cur2.close()
            conn2.close()


async def cleanup_dead_agents():
    """Remove portfolios and positions of dead agents"""
    conn = get_db()
    cur = conn.cursor()

    cur.execute(
        """
        DELETE FROM agent_positions
        WHERE agent_id IN (
            SELECT id FROM agents WHERE is_alive = false
        )
        """
    )
    positions_deleted = cur.rowcount

    cur.execute(
        """
        DELETE FROM agent_portfolio
        WHERE agent_id IN (
            SELECT id FROM agents WHERE is_alive = false
        )
        """
    )
    portfolios_deleted = cur.rowcount

    cur.execute(
        """
        DELETE FROM agent_trades
        WHERE agent_id IN (
            SELECT id FROM agents WHERE is_alive = false
        )
        """
    )
    trades_deleted = cur.rowcount

    conn.commit()
    cur.close()
    conn.close()

    if portfolios_deleted > 0:
        print(
            f"Cleaned up {portfolios_deleted} dead agent portfolios, "
            f"{positions_deleted} positions, {trades_deleted} trades",
            flush=True,
        )


async def main():
    print("Z-PERPS worker starting...", flush=True)
    await init_portfolios()
    print("Init done, starting main loop", flush=True)

    cycle_count = 0

    while True:
        try:
            if cycle_count % 10 == 0:
                await init_portfolios()

            print("Fetching prices...", flush=True)
            prices = await fetch_prices()
            print(f"Prices OK: BTC={prices.get('BTC')}", flush=True)

            await check_and_close_positions(prices)
            print("Positions checked", flush=True)

            await open_new_trades(prices)
            print("New trades opened", flush=True)

            cycle_count += 1
            if cycle_count % 50 == 0:
                await update_blacklist()
            if cycle_count % 10 == 0:
                await cleanup_dead_agents()
                print(f"Cleanup done at cycle {cycle_count}", flush=True)

            print("Cycle complete, sleeping 60s...", flush=True)
            await asyncio.sleep(60)
        except Exception as e:
            print(f"Worker error: {e}", flush=True)
            await asyncio.sleep(60)


if __name__ == "__main__":
    asyncio.run(main())

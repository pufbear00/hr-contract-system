"""自动补全模板变量：拼音英文名、中英文日期/月份翻译、工资结算日推算、N+1补偿金额。"""
import calendar
import math
import re
from datetime import date, timedelta

from pypinyin import lazy_pinyin, Style

# 中文月份 → 英文月份
MONTH_CN_TO_EN = {
    "一月": "January", "1月": "January",
    "二月": "February", "2月": "February",
    "三月": "March", "3月": "March",
    "四月": "April", "4月": "April",
    "五月": "May", "5月": "May",
    "六月": "June", "6月": "June",
    "七月": "July", "7月": "July",
    "八月": "August", "8月": "August",
    "九月": "September", "9月": "September",
    "十月": "October", "10月": "October",
    "十一月": "November", "11月": "November",
    "十二月": "December", "12月": "December",
}

MONTH_NUM_TO_EN = {
    1: "January", 2: "February", 3: "March", 4: "April",
    5: "May", 6: "June", 7: "July", 8: "August",
    9: "September", 10: "October", 11: "November", 12: "December",
}


def chinese_to_pinyin_name(name: str) -> str:
    """中文姓名 → 拼音英文名（姓大写，名首字母大写）。
    例：张三 → San Zhang（虚构示例）
    """
    if not name or not any('\u4e00' <= c <= '\u9fff' for c in name):
        return name  # 非中文直接返回

    chars = list(name)
    surname = chars[0]
    given = chars[1:]

    surname_pinyin = "".join(lazy_pinyin(surname, style=Style.NORMAL)).capitalize()
    given_pinyin = "".join(lazy_pinyin(given, style=Style.NORMAL)).capitalize()

    return f"{given_pinyin} {surname_pinyin}"


def _parse_chinese_date(text: str) -> date | None:
    """尝试从各种中文日期格式解析出 date 对象。
    支持: 2026年3月31日, 2026-03-31, 2026/3/31 等
    """
    if not text:
        return None
    text = text.strip()

    # 2026年3月31日
    m = re.match(r"(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?", text)
    if m:
        return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))

    # 2026-03-31 or 2026/3/31
    m = re.match(r"(\d{4})[-/](\d{1,2})[-/](\d{1,2})", text)
    if m:
        return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))

    return None


def date_to_english(text: str) -> str:
    """中文日期 → 英文格式。
    2026年3月31日 → March 31, 2026
    2026-03-31 → March 31, 2026
    """
    d = _parse_chinese_date(text)
    if not d:
        return text
    return f"{MONTH_NUM_TO_EN[d.month]} {d.day}, {d.year}"


def month_to_english(text: str) -> str:
    """中文月份 → 英文月份。
    三月 → March, 3月 → March, 2026年3月 → March 2026
    """
    if not text:
        return text
    text = text.strip()

    # 直接匹配 "三月", "3月" 等
    if text in MONTH_CN_TO_EN:
        return MONTH_CN_TO_EN[text]

    # "2026年3月" 格式
    m = re.match(r"(\d{4})\s*年\s*(\d{1,2})\s*月", text)
    if m:
        month_num = int(m.group(2))
        return f"{MONTH_NUM_TO_EN.get(month_num, text)} {m.group(1)}"

    return text


def _last_day_of_month(d: date) -> date:
    """获取某月最后一天。"""
    _, last = calendar.monthrange(d.year, d.month)
    return date(d.year, d.month, last)


def _format_cn_date(d: date) -> str:
    """date → 中文日期格式: 2026年3月31日"""
    return f"{d.year}年{d.month}月{d.day}日"


def calculate_n(entry_date: date, termination_date: date) -> float:
    """计算经济补偿的 N（工龄系数）。

    劳动合同法第四十七条:
    - 每满一年支付一个月工资
    - 六个月以上不满一年的，按一年计算 → +1
    - 不满六个月的，支付半个月工资 → +0.5
    """
    total_days = (termination_date - entry_date).days
    if total_days <= 0:
        return 0

    full_years = total_days // 365
    remaining_days = total_days % 365

    if remaining_days >= 183:  # ≈6个月
        return full_years + 1
    elif remaining_days > 0:
        return full_years + 0.5
    else:
        return float(full_years)


def calculate_compensation(
    entry_date: date,
    termination_date: date,
    base_salary: float,
    monthly_cap: float | None = None,
) -> dict:
    """计算 N+1 经济补偿金额。

    N 部分: N * min(base_salary, monthly_cap)
    +1 部分: base_salary（代通知金，按实际月薪）

    返回: {"n": N值, "n_monthly": N部分月薪, "compensation_n": N部分金额,
            "compensation_1": +1部分, "compensation_amount": 总额}
    """
    n = calculate_n(entry_date, termination_date)
    n_monthly = min(base_salary, monthly_cap) if monthly_cap else base_salary
    comp_n = n * n_monthly
    comp_1 = base_salary
    total = comp_n + comp_1

    return {
        "n": n,
        "n_monthly": round(n_monthly, 2),
        "compensation_n": round(comp_n, 2),
        "compensation_1": round(comp_1, 2),
        "compensation_amount": round(total, 2),
    }


def enrich_values(values: dict, monthly_cap: float | None = None) -> dict:
    """对模板变量进行自动补全和翻译。

    规则:
    1. employee_name_en: 从 employee_name 自动生成拼音
    2. xxx_en: 从对应中文字段自动翻译
    3. salary_period_end: 从 termination_date 推算离职当月最后一天
    4. salary_period_start_en / salary_period_end_en: 自动翻译
    5. compensation_amount: 从 entry_date + termination_date + base_salary 自动算 N+1
    """
    enriched = dict(values)

    # 1. 英文名 — 拼音
    if enriched.get("employee_name") and not enriched.get("employee_name_en"):
        enriched["employee_name_en"] = chinese_to_pinyin_name(enriched["employee_name"])

    # 1b. 合同日期自动推导
    if enriched.get("entry_date"):
        entry_d = _parse_chinese_date(str(enriched["entry_date"]))
        if entry_d:
            if not enriched.get("contract_start_date"):
                enriched["contract_start_date"] = enriched["entry_date"]
            if not enriched.get("contract_end_date"):
                end_d = date(entry_d.year + 3, entry_d.month, entry_d.day) - timedelta(days=1)
                enriched["contract_end_date"] = _format_cn_date(end_d)

    # 2. 离职日期英文
    if enriched.get("termination_date") and not enriched.get("termination_date_en"):
        enriched["termination_date_en"] = date_to_english(enriched["termination_date"])

    # 3. 工资结算起止日 — 离职当月1号~离职日
    if enriched.get("termination_date"):
        td = _parse_chinese_date(enriched["termination_date"])
        if td:
            if not enriched.get("salary_period_start"):
                enriched["salary_period_start"] = _format_cn_date(date(td.year, td.month, 1))
            if not enriched.get("salary_period_end"):
                enriched["salary_period_end"] = _format_cn_date(td)

    # 4. 工资发放月份英文
    if enriched.get("salary_month") and not enriched.get("salary_month_en"):
        enriched["salary_month_en"] = month_to_english(enriched["salary_month"])

    # 5. 工资结算起止日英文
    if enriched.get("salary_period_start") and not enriched.get("salary_period_start_en"):
        enriched["salary_period_start_en"] = date_to_english(enriched["salary_period_start"])
    if enriched.get("salary_period_end") and not enriched.get("salary_period_end_en"):
        enriched["salary_period_end_en"] = date_to_english(enriched["salary_period_end"])

    # 6. 补偿金额 N+1 自动计算（仅当未手动填写时）
    if not enriched.get("compensation_amount"):
        entry_str = enriched.get("entry_date")
        term_str = enriched.get("termination_date")
        base_str = enriched.get("base_salary")
        if entry_str and term_str and base_str:
            entry_d = _parse_chinese_date(str(entry_str))
            term_d = _parse_chinese_date(str(term_str))
            try:
                base = float(base_str)
            except (ValueError, TypeError):
                base = None
            if entry_d and term_d and base:
                result = calculate_compensation(entry_d, term_d, base, monthly_cap)
                enriched["compensation_amount"] = str(result["compensation_amount"])

    return enriched

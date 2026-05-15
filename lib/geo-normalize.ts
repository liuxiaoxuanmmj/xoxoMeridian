/**
 * Normalize Chinese (and other non-English) city/country names to English
 * equivalents that city-timezones can look up.
 */

const CITY_MAP: Record<string, string> = {
  "北京": "Beijing",
  "上海": "Shanghai",
  "广州": "Guangzhou",
  "深圳": "Shenzhen",
  "成都": "Chengdu",
  "杭州": "Hangzhou",
  "武汉": "Wuhan",
  "西安": "Xian",
  "南京": "Nanjing",
  "重庆": "Chongqing",
  "天津": "Tianjin",
  "苏州": "Suzhou",
  "长沙": "Changsha",
  "沈阳": "Shenyang",
  "青岛": "Qingdao",
  "大连": "Dalian",
  "厦门": "Xiamen",
  "昆明": "Kunming",
  "哈尔滨": "Harbin",
  "济南": "Jinan",
  "福州": "Fuzhou",
  "郑州": "Zhengzhou",
  "长春": "Changchun",
  "乌鲁木齐": "Urumqi",
  "拉萨": "Lhasa",
  "呼和浩特": "Hohhot",
  "南宁": "Nanning",
  "贵阳": "Guiyang",
  "兰州": "Lanzhou",
  "太原": "Taiyuan",
  "合肥": "Hefei",
  "石家庄": "Shijiazhuang",
  "香港": "Hong Kong",
  "澳门": "Macau",
  "台北": "Taipei",
  "高雄": "Kaohsiung",
  "东京": "Tokyo",
  "大阪": "Osaka",
  "首尔": "Seoul",
  "釜山": "Busan",
  "曼谷": "Bangkok",
  "新加坡": "Singapore",
  "吉隆坡": "Kuala Lumpur",
  "雅加达": "Jakarta",
  "马尼拉": "Manila",
  "河内": "Hanoi",
  "胡志明市": "Ho Chi Minh City",
  "孟买": "Mumbai",
  "新德里": "New Delhi",
  "伦敦": "London",
  "巴黎": "Paris",
  "柏林": "Berlin",
  "罗马": "Rome",
  "马德里": "Madrid",
  "阿姆斯特丹": "Amsterdam",
  "莫斯科": "Moscow",
  "纽约": "New York",
  "洛杉矶": "Los Angeles",
  "旧金山": "San Francisco",
  "芝加哥": "Chicago",
  "多伦多": "Toronto",
  "温哥华": "Vancouver",
  "悉尼": "Sydney",
  "墨尔本": "Melbourne",
  "奥克兰": "Auckland",
  "迪拜": "Dubai",
  "开罗": "Cairo",
  "曼彻斯特": "Manchester",
  "爱丁堡": "Edinburgh",
};

const COUNTRY_MAP: Record<string, string> = {
  "中国": "China",
  "日本": "Japan",
  "韩国": "South Korea",
  "美国": "United States of America",
  "英国": "United Kingdom",
  "法国": "France",
  "德国": "Germany",
  "意大利": "Italy",
  "西班牙": "Spain",
  "荷兰": "Netherlands",
  "俄罗斯": "Russia",
  "加拿大": "Canada",
  "澳大利亚": "Australia",
  "新西兰": "New Zealand",
  "新加坡": "Singapore",
  "马来西亚": "Malaysia",
  "泰国": "Thailand",
  "印度": "India",
  "印度尼西亚": "Indonesia",
  "菲律宾": "Philippines",
  "越南": "Vietnam",
  "阿联酋": "United Arab Emirates",
  "埃及": "Egypt",
};

export function normalizeCityName(city: string): string {
  const trimmed = city.trim();
  return CITY_MAP[trimmed] ?? trimmed;
}

export function normalizeCountryName(country: string | null | undefined): string | null {
  if (!country) return null;
  const trimmed = country.trim();
  if (trimmed === "" || trimmed === "—") return null;
  return COUNTRY_MAP[trimmed] ?? trimmed;
}

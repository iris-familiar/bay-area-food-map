#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Final accurate restaurant database from all 82 Xiaohongshu posts
Manually curated based on detailed analysis of each post
"""

import json
import os
from datetime import datetime

# Comprehensive restaurant data extracted from all 82 posts
RESTAURANT_DATA = [
    # Post 1: 湾区丨最近我在吃什么(2) - 245 engagement
    {"name": "留湘小聚Cupertino", "name_en": "Ping's Bistro", "cuisine": "湘菜/云南菜", "area": "Cupertino", "post_id": "66667292000000000f00f266", "engagement": 245, "recommendations": ["傣味香茅草烤鱼", "牛肝菌青椒牛肉炒饭", "炒牛肉"]},
    {"name": "沪鼎记", "name_en": "", "cuisine": "上海菜", "area": "Cupertino", "post_id": "66667292000000000f00f266", "engagement": 245, "recommendations": ["炸猪排", "酱鸭", "生煎"]},
    {"name": "Pacific Catch", "name_en": "", "cuisine": "海鲜", "area": "", "post_id": "66667292000000000f00f266", "engagement": 245, "recommendations": ["牛排炒饭", "鱼生沙拉"]},
    {"name": "Pepperlunch", "name_en": "", "cuisine": "日式", "area": "", "post_id": "66667292000000000f00f266", "engagement": 245, "recommendations": []},
    {"name": "Yogurtland", "name_en": "", "cuisine": "甜品", "area": "", "post_id": "66667292000000000f00f266", "engagement": 245, "recommendations": ["酸奶冰淇淋"]},
    {"name": "BBQ Chicken", "name_en": "", "cuisine": "炸鸡", "area": "", "post_id": "66667292000000000f00f266", "engagement": 245, "recommendations": ["芝士boneless", "honey soy wings"]},
    {"name": "韶山印象", "name_en": "Hunan Impression", "cuisine": "湘菜", "area": "Cupertino", "post_id": "66667292000000000f00f266", "engagement": 245, "recommendations": []},
    {"name": "半岛Milpitas", "name_en": "", "cuisine": "中餐", "area": "Milpitas", "post_id": "66667292000000000f00f266", "engagement": 245, "recommendations": []},
    
    # Post 3: 50吃到撑！Sunnyvale超高性价比 - 643 engagement
    {"name": "一品香饺子", "name_en": "Epic Dumpling", "cuisine": "饺子/中餐", "area": "Sunnyvale", "post_id": "670977d9000000002a03115c", "engagement": 643, "recommendations": ["三鲜水饺", "香脆客家猪肉丸", "蒜香葱油薄饼", "凉拌耳丝", "干炒牛河"]},
    
    # Post 6: 降温了！来Fremont吃湾区最正宗沸腾鱼 - 465 engagement
    {"name": "麻辣诱惑", "name_en": "Chongqing Xiaomian", "cuisine": "川菜", "area": "Fremont", "post_id": "675f38fb0000000001028bc0", "engagement": 465, "recommendations": ["水煮鱼", "沸腾鱼"]},
    
    # Post 7: 真羡慕你们Milpitas有这么多好吃的 - 130 engagement
    {"name": "山城私房菜", "name_en": "", "cuisine": "川菜", "area": "Milpitas", "post_id": "67b3ee5700000000070314d3", "engagement": 130, "recommendations": ["啤酒鸭", "白辣椒"]},
    {"name": "Malatown", "name_en": "", "cuisine": "麻辣烫", "area": "Milpitas", "post_id": "67b3ee5700000000070314d3", "engagement": 130, "recommendations": []},
    
    # Post 8: 湾区中餐超全超真诚推荐 - 4149 engagement
    {"name": "面面俱到", "name_en": "", "cuisine": "上海菜", "area": "Fremont", "post_id": "67ba7dae00000000290119d8", "engagement": 4149, "recommendations": []},
    {"name": "Jun Bistro", "name_en": "", "cuisine": "融合菜", "area": "", "post_id": "67ba7dae00000000290119d8", "engagement": 4149, "recommendations": []},
    {"name": "留湘", "name_en": "", "cuisine": "湘菜", "area": "", "post_id": "67ba7dae00000000290119d8", "engagement": 4149, "recommendations": []},
    
    # Post 9: 被Sunnyvale这家蒸饭惊艳了 - 344 engagement
    {"name": "蒸功夫", "name_en": "", "cuisine": "中餐", "area": "Sunnyvale", "post_id": "67bbe327000000000603d76d", "engagement": 344, "recommendations": ["腊肉蒸饭", "猪蹄蒸饭"]},
    
    # Post 10: 三家吃完就想二刷的餐厅 - 113 engagement
    {"name": "留湘小聚Cupertino", "name_en": "Ping's Bistro", "cuisine": "湘菜/云南菜", "area": "Cupertino", "post_id": "67f363f0000000001c01ecd5", "engagement": 113, "recommendations": ["傣味香茅草烤鱼", "牛肝菌青椒牛肉炒饭"]},
    
    # Post 12: Milpitas江南雅厨 - 78 engagement
    {"name": "江南雅厨", "name_en": "JiangNan Delicacy", "cuisine": "江浙菜", "area": "Milpitas", "post_id": "68200be20000000023015646", "engagement": 78, "recommendations": ["江南松鼠鱼", "姑苏美味酱方", "毛豆番茄"]},
    
    # Post 13: 两周吃遍湾区中餐 - 314 engagement
    {"name": "韶山印象", "name_en": "Hunan Impression", "cuisine": "湘菜", "area": "Cupertino", "post_id": "6856cc340000000013011fd6", "engagement": 314, "recommendations": ["小炒黄牛肉", "农家一碗香", "铁板蒜香黄花鱼"]},
    {"name": "Hunan House", "name_en": "", "cuisine": "湘菜", "area": "", "post_id": "6856cc340000000013011fd6", "engagement": 314, "recommendations": []},
    
    # Post 14: Sunnyvale终于有好吃的中餐了 - 216 engagement
    {"name": "Eilleen's Kitchen", "name_en": "", "cuisine": "中餐", "area": "Sunnyvale", "post_id": "68620901000000001d00dc41", "engagement": 216, "recommendations": ["豆腐虾滑", "清炒佛手瓜", "古法猪肝", "杂菌牛舌", "辣椒炒黑猪肉"]},
    
    # Post 15: 老公心中的湾区湘菜榜第一 - 165 engagement
    {"name": "小炒猪腰脆肚", "name_en": "", "cuisine": "湘菜", "area": "Fremont", "post_id": "6875756b0000000015022f47", "engagement": 165, "recommendations": ["小炒猪腰脆肚", "毛氏红烧肉", "白辣椒炒五花肉"]},
    
    # Post 17: 湾区｜带我闺蜜去吃好吃的 - 54 engagement
    {"name": "Mina's Korea BBQ", "name_en": "", "cuisine": "韩餐", "area": "San Jose", "post_id": "68891d96000000002301aadf", "engagement": 54, "recommendations": ["拌饭", "韩式炒杂菜", "韩国饼"]},
    {"name": "Old Street Chengpan Malatang", "name_en": "", "cuisine": "麻辣烫", "area": "", "post_id": "68891d96000000002301aadf", "engagement": 54, "recommendations": []},
    {"name": "Shanghai Noodle House", "name_en": "", "cuisine": "上海菜", "area": "", "post_id": "68891d96000000002301aadf", "engagement": 54, "recommendations": []},
    {"name": "Cafe Mei", "name_en": "", "cuisine": "中餐", "area": "", "post_id": "68891d96000000002301aadf", "engagement": 54, "recommendations": []},
    {"name": "Kathmandu Cuisine", "name_en": "", "cuisine": "尼泊尔菜", "area": "", "post_id": "68891d96000000002301aadf", "engagement": 54, "recommendations": []},
    
    # Post 18: 湾区MTV宝藏下饭川湘菜 - 165 engagement
    {"name": "川湘小馆", "name_en": "", "cuisine": "川湘菜", "area": "Mountain View", "post_id": "688960da0000000023020ce4", "engagement": 165, "recommendations": ["咸鸭蛋炒豆苗", "农家炒土鸡", "石锅豆花肥牛"]},
    
    # Post 22: 湾区｜MTV这家泰餐小馆太惊喜 - 326 engagement
    {"name": "Kow Kra Pao", "name_en": "", "cuisine": "泰国菜", "area": "Mountain View", "post_id": "68af9c91000000001d014f9a", "engagement": 326, "recommendations": ["打抛猪肉饭", "Taro Samosa", "Tom Yum Soup"]},
    
    # Post 23: Mountain View｜一条美食街 - 70 engagement
    {"name": "花溪王", "name_en": "Joyous Cuisine", "cuisine": "贵州菜", "area": "Mountain View", "post_id": "68bb9f83000000001b02386a", "engagement": 70, "recommendations": []},
    
    # Post 24: 湾区探店之二刷MTV downtown包大人 - 28 engagement
    {"name": "包大人", "name_en": "", "cuisine": "上海菜", "area": "Mountain View", "post_id": "68bc9008000000001c031aeb", "engagement": 28, "recommendations": ["蟹粉小笼", "生煎馒头", "马兰头"]},
    
    # Post 25: 湾区探店｜新店老店红黑榜 - 119 engagement
    {"name": "Hong Kong Restaurant", "name_en": "", "cuisine": "粤菜", "area": "Palo Alto", "post_id": "68c1b57f000000001d00c132", "engagement": 119, "recommendations": ["烧鸭", "贵妃鸡"]},
    {"name": "JOEY Valley Fair", "name_en": "", "cuisine": "西餐", "area": "Santa Clara", "post_id": "68c1b57f000000001d00c132", "engagement": 119, "recommendations": []},
    
    # Post 26: 湾区网红美食测评｜米一｜留湘 - 132 engagement
    {"name": "San Ho Won", "name_en": "", "cuisine": "韩餐", "area": "", "post_id": "68c224b1000000001b01f784", "engagement": 132, "recommendations": ["egg soufflé", "Double-cut galbi"]},
    
    # Post 27: 硅谷吃饭无趣星人 - 188 engagement
    {"name": "Gyu-Kaku Japanese BBQ", "name_en": "", "cuisine": "日料/烧烤", "area": "", "post_id": "68c71d50000000001c005084", "engagement": 188, "recommendations": []},
    {"name": "Mingkee Deli", "name_en": "", "cuisine": "中餐", "area": "", "post_id": "68c71d50000000001c005084", "engagement": 188, "recommendations": []},
    {"name": "ROKKO", "name_en": "", "cuisine": "日料", "area": "", "post_id": "68c71d50000000001c005084", "engagement": 188, "recommendations": []},
    {"name": "DISHDASH", "name_en": "", "cuisine": "中东菜", "area": "", "post_id": "68c71d50000000001c005084", "engagement": 188, "recommendations": []},
    {"name": "Ume", "name_en": "", "cuisine": "奶茶", "area": "", "post_id": "68c71d50000000001c005084", "engagement": 188, "recommendations": []},
    {"name": "10 Butchers Korean BBQ", "name_en": "", "cuisine": "韩餐", "area": "", "post_id": "68c71d50000000001c005084", "engagement": 188, "recommendations": []},
    {"name": "HL Peninsula Restaurant", "name_en": "", "cuisine": "粤菜", "area": "", "post_id": "68c71d50000000001c005084", "engagement": 188, "recommendations": []},
    {"name": "BE.STEAK.A", "name_en": "", "cuisine": "牛排", "area": "", "post_id": "68c71d50000000001c005084", "engagement": 188, "recommendations": []},
    {"name": "Hunan House", "name_en": "", "cuisine": "湘菜", "area": "", "post_id": "68c71d50000000001c005084", "engagement": 188, "recommendations": []},
    {"name": "Kusan Uyghur Cuisine", "name_en": "", "cuisine": "新疆菜", "area": "", "post_id": "68c71d50000000001c005084", "engagement": 188, "recommendations": []},
    
    # Post 29: Mountain View新开了一家中餐 - 71 engagement
    {"name": "川湘小馆", "name_en": "", "cuisine": "川湘菜", "area": "Mountain View", "post_id": "68d61f76000000000b03e9ad", "engagement": 71, "recommendations": ["擂椒茄子", "水煮牛肉", "鱼汤"]},
    
    # Post 30: 老广泪目了！湾区有正宗精致潮汕砂锅粥 - 1036 engagement
    {"name": "活粥王", "name_en": "", "cuisine": "潮汕菜", "area": "Fremont", "post_id": "68db4e100000000007014ccc", "engagement": 1036, "recommendations": ["砂锅粥", "干贝虾仁鲍鱼膏蟹粥"]},
    
    # Post 32: 9月湾区小夫妻的吃吃喝喝 - 111 engagement
    {"name": "Wojiahunan", "name_en": "", "cuisine": "湘菜", "area": "Albany", "post_id": "68ddb63200000000040153ba", "engagement": 111, "recommendations": ["口水鸡", "擂椒茄子", "农家一碗香", "干拌粉", "牛小排锅"]},
    {"name": "Bangkok Street Thai Street Food", "name_en": "", "cuisine": "泰国菜", "area": "SF", "post_id": "68ddb63200000000040153ba", "engagement": 111, "recommendations": ["炒粉"]},
    
    # Post 34: 湾区探店｜漂漂亮亮的新派淮扬菜 - 83 engagement
    {"name": "锦鲤缘", "name_en": "", "cuisine": "淮扬菜", "area": "Sunnyvale", "post_id": "68f2ae790000000007008035", "engagement": 83, "recommendations": []},
    
    # Post 35: 湾区第一牛肉面和水饺 - 249 engagement
    {"name": "美食坊", "name_en": "Seasons Noodles and Dumpling Garden", "cuisine": "面食", "area": "Mountain View", "post_id": "68f30d8f000000000703b59a", "engagement": 249, "recommendations": ["红烧牛肉面", "番茄牛肉面", "三鲜水饺"]},
    
    # Post 36: Mountain View 花溪王 - 96 engagement
    {"name": "花溪王", "name_en": "Joyous Cuisine", "cuisine": "贵州菜", "area": "Mountain View", "post_id": "68fc063b0000000007017e54", "engagement": 96, "recommendations": ["猪蹄"]},
    
    # Post 39: 湾区一年吃好饭😋整理推荐之：中餐篇-1 - 253 engagement
    {"name": "韶山印象", "name_en": "Hunan Impression", "cuisine": "湘菜", "area": "San Jose", "post_id": "690c40bf0000000005039eae", "engagement": 253, "recommendations": ["海鲜", "河鲜", "炒菜"]},
    {"name": "小聚", "name_en": "Ping's Bistro Cupertino", "cuisine": "云南菜", "area": "Cupertino", "post_id": "690c40bf0000000005039eae", "engagement": 253, "recommendations": []},
    {"name": "一屋饭湘", "name_en": "Hunan House", "cuisine": "湘菜", "area": "", "post_id": "690c40bf0000000005039eae", "engagement": 253, "recommendations": []},
    {"name": "小刘清粥", "name_en": "", "cuisine": "台湾菜", "area": "", "post_id": "690c40bf0000000005039eae", "engagement": 253, "recommendations": []},
    {"name": "鱼你在一起", "name_en": "Wei's Fish", "cuisine": "川菜", "area": "", "post_id": "690c40bf0000000005039eae", "engagement": 253, "recommendations": []},
    {"name": "Mala Town", "name_en": "", "cuisine": "麻辣烫", "area": "", "post_id": "690c40bf0000000005039eae", "engagement": 253, "recommendations": []},
    {"name": "一品香", "name_en": "Hankow Cuisine", "cuisine": "湖北菜", "area": "", "post_id": "690c40bf0000000005039eae", "engagement": 253, "recommendations": []},
    
    # Post 40: 湾区一年吃好饭😋整理推荐之：中餐篇-2 - 25 engagement
    {"name": "Jun Bistro", "name_en": "", "cuisine": "融合菜", "area": "Milpitas", "post_id": "690cf26b000000000401123f", "engagement": 25, "recommendations": []},
    {"name": "外婆家常菜", "name_en": "Grandma's Kitchen", "cuisine": "家常菜", "area": "", "post_id": "690cf26b000000000401123f", "engagement": 25, "recommendations": []},
    {"name": "汉家宴", "name_en": "Home Eat", "cuisine": "中餐", "area": "", "post_id": "690cf26b000000000401123f", "engagement": 25, "recommendations": []},
    {"name": "丁香砂锅馆", "name_en": "Sizzling Pot House", "cuisine": "砂锅", "area": "", "post_id": "690cf26b000000000401123f", "engagement": 25, "recommendations": []},
    {"name": "老高烧烤", "name_en": "GAO's BBQ & Crab", "cuisine": "烧烤", "area": "Milpitas", "post_id": "690cf26b000000000401123f", "engagement": 25, "recommendations": []},
    {"name": "香小馆", "name_en": "Shang Cafe", "cuisine": "川菜", "area": "San Jose", "post_id": "690cf26b000000000401123f", "engagement": 25, "recommendations": []},
    
    # Post 41: 湾区竟然有这么一个"山野森林系"贵州餐厅 - 287 engagement
    {"name": "山野森林系贵州餐厅", "name_en": "", "cuisine": "贵州菜", "area": "Mountain View", "post_id": "690da53a00000000070035c0", "engagement": 287, "recommendations": ["嗦粉", "烤鱼"]},
    
    # Post 42: Cupertino 一周吃什么 - 41 engagement
    {"name": "Apple Green Bistro", "name_en": "", "cuisine": "中餐", "area": "Cupertino", "post_id": "690f77cf00000000050317bb", "engagement": 41, "recommendations": ["水煮牛肉"]},
    {"name": "Cozy Tea Loft", "name_en": "", "cuisine": "台湾小吃", "area": "", "post_id": "690f77cf00000000050317bb", "engagement": 41, "recommendations": ["盐酥鸡", "章鱼小丸子"]},
    
    # Post 45: 湾区最难忘的一口 直接沦陷了 - 1172 engagement
    {"name": "Tanto", "name_en": "", "cuisine": "日料", "area": "Sunnyvale", "post_id": "69111cdd0000000004023026", "engagement": 1172, "recommendations": ["鳗鱼茶泡饭", "GYUTAN 牛舌", "UMAKI TAMAGO 鳗鱼蛋卷", "SASHIMI", "AGEDASHI TOFU"]},
    
    # Post 46: 湾区Milpitas好吃的家常菜推荐 - 168 engagement
    {"name": "缘聚鑫", "name_en": "Yuan Bistro", "cuisine": "东北菜/川菜", "area": "Milpitas", "post_id": "6913dafe0000000003012733", "engagement": 168, "recommendations": ["锅包肉", "农家一碗香", "雷椒茄子"]},
    
    # Post 47: 湾区|超有锅气的湘菜！ - 85 engagement
    {"name": "川湘1616", "name_en": "Spices Garden", "cuisine": "湘菜", "area": "Fremont", "post_id": "6915061a000000001b030af5", "engagement": 85, "recommendations": ["烤鱼", "手撕包菜"]},
    
    # Post 48: 冬天一口暖暖的Sunnyvale平价上海家常味 - 531 engagement
    {"name": "鲜味水饺", "name_en": "Umami Dumpling House", "cuisine": "上海菜", "area": "Sunnyvale", "post_id": "6915759900000000070383d7", "engagement": 531, "recommendations": ["香菇鱼肉水饺", "上海菜", "水饺面条"]},
    
    # Post 49: Sunnyvale现做现蒸的包子铺 - 366 engagement
    {"name": "李与白包子铺", "name_en": "", "cuisine": "包子", "area": "Sunnyvale", "post_id": "6918dec500000000070329d8", "engagement": 366, "recommendations": ["酱肉包", "芽菜包", "豌豆面", "豆浆"]},
    
    # Post 50: 大冷天还得是砂锅+烧烤组合 - 507 engagement
    {"name": "从前的小酒馆", "name_en": "", "cuisine": "烧烤", "area": "Fremont", "post_id": "691d486c000000001b0226a9", "engagement": 507, "recommendations": ["鸡脆骨", "黄喉", "烤尖椒", "烤猪蹄", "烤冷面", "砂锅米线", "麻辣烫"]},
    
    # Post 52: 在湾区吃过的最好的烤活鱼 - 291 engagement
    {"name": "麻辣诱惑", "name_en": "ChongQing Xiao Mian", "cuisine": "川菜", "area": "Fremont", "post_id": "6923764a000000001f00cd7c", "engagement": 291, "recommendations": ["烤活鱼", "沸腾活鱼"]},
    
    # Post 54: 湾区超好吃的万峦猪脚和麻油鸡 - 625 engagement
    {"name": "林家万峦猪脚", "name_en": "Taiwan Cafe", "cuisine": "台湾菜", "area": "Milpitas", "post_id": "6928cb59000000001e02569d", "engagement": 625, "recommendations": ["万峦猪脚", "炒面线", "麻油鸡汤", "咸蛋苦瓜"]},
    
    # Post 55: 南湾Cupertino的重庆荣昌铺盖面 - 322 engagement
    {"name": "重庆铺盖面", "name_en": "C.Q. Taste", "cuisine": "川菜", "area": "Cupertino", "post_id": "692d5aaf000000001b020caa", "engagement": 322, "recommendations": ["铺盖面"]},
    
    # Post 56: 湾区|免小费还给超多小料！ - 693 engagement
    {"name": "老桂林", "name_en": "Old Gui Lin", "cuisine": "中餐", "area": "Fremont", "post_id": "692e54da000000000d03ac6b", "engagement": 693, "recommendations": []},
    
    # Post 57: 湾区|李与白好吃 - 180 engagement
    {"name": "李与白", "name_en": "", "cuisine": "包子", "area": "Sunnyvale", "post_id": "69332e7d00000000190259bd", "engagement": 180, "recommendations": ["酱肉包", "青椒猪肉包", "豆浆", "豌杂面"]},
    
    # Post 58: 湾区最好吃的川湘菜 - 43 engagement
    {"name": "爱饭", "name_en": "", "cuisine": "川湘菜", "area": "Mountain View", "post_id": "6934dc5b000000000d00c98b", "engagement": 43, "recommendations": ["霉千张炒辣椒", "炭烤乌龙奶茶"]},
    
    # Post 59: 湾区 Mountain View | 最强三奶 - 577 engagement
    {"name": "Los Panchos", "name_en": "", "cuisine": "墨西哥菜", "area": "Mountain View", "post_id": "69388a61000000001e038496", "engagement": 577, "recommendations": ["三奶蛋糕 Tres leches cake"]},
    
    # Post 61: 湾区吃喝周记 - 92 engagement
    {"name": "李与白包子铺", "name_en": "Lee & Bai Chinese Bao shop", "cuisine": "包子", "area": "Sunnyvale", "post_id": "693e02ff000000001e038ae4", "engagement": 92, "recommendations": ["酱肉包", "青椒猪肉包", "豆浆"]},
    {"name": "留湘", "name_en": "", "cuisine": "湘菜", "area": "", "post_id": "693e02ff000000001e038ae4", "engagement": 92, "recommendations": []},
    
    # Post 63: 湾区美食 最近孩子爱吃的饭店 - 192 engagement
    {"name": "Jun Bistro", "name_en": "", "cuisine": "融合菜", "area": "", "post_id": "6945a4d1000000000d00c3d4", "engagement": 192, "recommendations": ["松露野菌牛油拌饭", "宝宝米线", "芭蕉叶包烧鱼", "小炒黄牛肉", "贵州米锅巴", "石杵茄子"]},
    
    # Post 65: 南湾｜特来品尝来自国内的黑珍珠苏州菜 - 99 engagement
    {"name": "江南雅厨", "name_en": "JiangNan Delicacy", "cuisine": "江浙菜", "area": "Milpitas", "post_id": "694b2ea6000000001e015ae5", "engagement": 99, "recommendations": ["松鼠鱼"]},
    
    # Post 66: Milpitas这家美味又干净 - 210 engagement
    {"name": "缘聚鑫", "name_en": "Yuan Bistro", "cuisine": "东北菜/川菜", "area": "Milpitas", "post_id": "694d9c04000000001e0255af", "engagement": 210, "recommendations": ["锅包肉"]},
    
    # Post 67: 我在湾区咪西咪西 - 311 engagement
    {"name": "Mensho Tokyo", "name_en": "", "cuisine": "拉面", "area": "SF", "post_id": "694dc5a3000000002200ba41", "engagement": 311, "recommendations": ["GKO"]},
    {"name": "Nom Nom Bistro", "name_en": "", "cuisine": "港式", "area": "Millbrae", "post_id": "694dc5a3000000002200ba41", "engagement": 311, "recommendations": ["咖喱牛腩饭", "港式奶茶"]},
    
    # Post 69: 湾区美食求推荐 - 355 engagement
    {"name": "金戈戈", "name_en": "", "cuisine": "烧腊", "area": "San Leandro", "post_id": "6950d36c000000001e012431", "engagement": 355, "recommendations": ["双拼饭"]},
    {"name": "10 seconds yunnan noodle", "name_en": "", "cuisine": "云南菜", "area": "San Leandro", "post_id": "6950d36c000000001e012431", "engagement": 355, "recommendations": []},
    {"name": "菜友记", "name_en": "cai you kee", "cuisine": "中餐", "area": "San Leandro", "post_id": "6950d36c000000001e012431", "engagement": 355, "recommendations": []},
    
    # Post 70: 湾区美食🔥单方面宣布Cupertino最好吃湘菜 - 91 engagement
    {"name": "眷湘Cupertino", "name_en": "", "cuisine": "湘菜", "area": "Cupertino", "post_id": "695482920000000021033da0", "engagement": 91, "recommendations": ["盐菜扣肉"]},
    
    # Post 71: 推荐南湾这家拉面 - 35 engagement
    {"name": "小香米粉", "name_en": "", "cuisine": "拉面", "area": "", "post_id": "6954b293000000001e003bd7", "engagement": 35, "recommendations": ["传统拉面", "酸辣粉", "羊肉串"]},
    
    # Post 72: 湾区年夜饭｜差点被差评劝退 - 127 engagement
    {"name": "湘粤情", "name_en": "", "cuisine": "湘菜/粤菜", "area": "Cupertino", "post_id": "69572ce8000000001d03de1d", "engagement": 127, "recommendations": []},
    
    # Post 73: 湾区美食🥟一人说一个吃过20次以上的餐厅 - 131 engagement
    {"name": "四姐Special Noodles", "name_en": "", "cuisine": "面食", "area": "", "post_id": "6959bddc000000002203982b", "engagement": 131, "recommendations": ["生煎包", "小笼包", "冰花煎饺"]},
    
    # Post 74: Sunnyvale Food - 2 engagement
    {"name": "Kunjip", "name_en": "", "cuisine": "韩餐", "area": "Sunnyvale", "post_id": "695dd6e5000000000c035d69", "engagement": 2, "recommendations": ["Cheese maeun Galbi Jjim", "Modeum Sooyook"]},
    
    # Post 75: 南湾｜在湾区也吃到了那口家烧黄鱼手打年糕 - 306 engagement
    {"name": "Eilleen's Kitchen", "name_en": "", "cuisine": "江南菜/川渝菜", "area": "Sunnyvale", "post_id": "695f083a000000000b008f87", "engagement": 306, "recommendations": ["家烧黄鱼手打年糕"]},
    
    # Post 76: Cupertino 新开｜正宗川式砂锅 - 227 engagement
    {"name": "川式砂锅", "name_en": "", "cuisine": "川菜", "area": "Cupertino", "post_id": "695f421f000000001a022b7e", "engagement": 227, "recommendations": []},
    
    # Post 77: 湾区新店|汆悦麻辣烫 - 37 engagement
    {"name": "汆悦麻辣烫", "name_en": "", "cuisine": "麻辣烫", "area": "", "post_id": "69607392000000000a03362c", "engagement": 37, "recommendations": []},
    
    # Post 78: 南湾正宗沸腾鱼 - 560 engagement
    {"name": "麻辣诱惑", "name_en": "", "cuisine": "川菜", "area": "Fremont", "post_id": "697a6fea000000000b008c26", "engagement": 560, "recommendations": ["沸腾鱼"]},
    
    # Post 79: 来美10年，在湾区吃到了我暂时的人生饭店 - 303 engagement
    {"name": "新徽记", "name_en": "", "cuisine": "徽菜", "area": "", "post_id": "697a7529000000000b0111ab", "engagement": 303, "recommendations": []},
    
    # Post 80: 成都人四刷Cupertino重庆铺盖面 - 220 engagement
    {"name": "重庆铺盖面", "name_en": "C.Q. Taste", "cuisine": "川菜", "area": "Cupertino", "post_id": "697ad7a0000000000c035eb3", "engagement": 220, "recommendations": ["肥肠米线", "豌杂面", "酱肉包子"]},
    
    # Post 81: 湾区Cupertino 日常探店 - 216 engagement
    {"name": "重庆铺盖面", "name_en": "C.Q. Taste", "cuisine": "川菜", "area": "Cupertino", "post_id": "697c2dcb000000002200ab2d", "engagement": 216, "recommendations": ["豌杂面", "酱肉包子"]},
    {"name": "Matcha Town", "name_en": "", "cuisine": "甜品", "area": "Cupertino", "post_id": "697c2dcb000000002200ab2d", "engagement": 216, "recommendations": ["Salted cheese matcha float"]},
]

def build_database():
    """构建最终的餐厅数据库"""
    
    restaurants = {}
    counter = 1
    
    for entry in RESTAURANT_DATA:
        name = entry['name']
        key = name.lower().replace(' ', '').replace('.', '')
        
        if key not in restaurants:
            restaurants[key] = {
                'id': f'r{counter:03d}',
                'name': name,
                'name_en': entry.get('name_en', ''),
                'cuisine': entry.get('cuisine', ''),
                'area': entry.get('area', ''),
                'price_range': entry.get('price_range', ''),
                'total_engagement': 0,
                'mention_count': 0,
                'sources': [],
                'recommendations': [],
                'post_details': []
            }
            counter += 1
        
        rest = restaurants[key]
        rest['total_engagement'] += entry['engagement']
        rest['mention_count'] += 1
        
        if entry['post_id'] not in rest['sources']:
            rest['sources'].append(entry['post_id'])
        
        # 添加推荐菜品
        for rec in entry.get('recommendations', []):
            if rec and rec not in rest['recommendations']:
                rest['recommendations'].append(rec)
        
        # 添加post详情
        rest['post_details'].append({
            'post_id': entry['post_id'],
            'title': '',
            'date': '',
            'engagement': entry['engagement'],
            'context': ''
        })
    
    return restaurants

def main():
    OUTPUT_FILE = '/Users/joeli/.openclaw/workspace-planner/projects/bay-area-food-map/data/current/restaurant_database_llm.json'
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    
    restaurants = build_database()
    
    # 按engagement排序
    sorted_restaurants = sorted(
        restaurants.values(), 
        key=lambda x: x['total_engagement'], 
        reverse=True
    )
    
    result = {
        'restaurants': sorted_restaurants,
        'meta': {
            'total_restaurants': len(restaurants),
            'total_data_entries': len(RESTAURANT_DATA),
            'status': 'completed'
        }
    }
    
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    
    print(f"{'='*70}")
    print(f"✅ Restaurant Database Created Successfully!")
    print(f"{'='*70}")
    print(f"Total unique restaurants: {len(restaurants)}")
    print(f"Total data entries: {len(RESTAURANT_DATA)}")
    print(f"Output file: {OUTPUT_FILE}")
    print(f"\nTop 15 Restaurants by Engagement:")
    print(f"{'-'*70}")
    
    for i, r in enumerate(sorted_restaurants[:15], 1):
        area = f" [{r['area']}]" if r['area'] else ''
        cuisine = f" ({r['cuisine']})" if r['cuisine'] else ''
        mentions = f" [{r['mention_count']} mentions]" if r['mention_count'] > 1 else ''
        print(f"{i:2}. {r['name']}{area}{cuisine}{mentions}")
        print(f"    Engagement: {r['total_engagement']}")
        if r['recommendations']:
            print(f"    Recommendations: {', '.join(r['recommendations'][:5])}")
    
    print(f"{'='*70}")

if __name__ == '__main__':
    main()

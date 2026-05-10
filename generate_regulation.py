# -*- coding: utf-8 -*-
import sys, io, json, re
import openpyxl

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

wb = openpyxl.load_workbook('G:/urban-ai/VP_regulation.xlsx')
ws = wb['مخالفات التشوه البصري']

rows = [list(row) for row in ws.iter_rows(values_only=True)]
data_rows = rows[1:]  # skip header

# Build element → articles mapping
elements_order = []
elements_seen = {}
for row in data_rows:
    el_name = row[2]
    stage = row[1]
    if el_name not in elements_seen:
        elements_seen[el_name] = {'name': el_name, 'stage': stage, 'articles': []}
        elements_order.append(el_name)
    fine = row[11]
    if not isinstance(fine, (int, float)):
        fine = 0
    fine2 = row[12]
    if not isinstance(fine2, (int, float)):
        fine2 = 0
    elements_seen[el_name]['articles'].append({
        'seq': row[0],
        'no': row[3],
        'text': str(row[4]) if row[4] else '',
        'ref': str(row[5]) if row[5] else '',
        'unit': str(row[6]) if row[6] else '',
        'responsible': str(row[7]) if row[7] else '',
        'notice': str(row[8]) if row[8] else '',
        'severity': str(row[9]) if row[9] else '',
        'period': str(row[10]) if row[10] else '',
        'fineAmana': fine,
        'fineMunicipality': fine2,
        'punishment': str(row[13]) if row[13] else '',
        'repeat': str(row[14]) if row[14] else '',
    })

# Color palette by stage
stage_colors = {
    'المرحلة الأولى': ['#EF4444','#F97316','#F59E0B','#FBBF24','#FDE68A','#FB923C'],
    'المرحلة الثانية': ['#8B5CF6','#EC4899','#A855F7','#D946EF','#6366F1','#3B82F6','#0EA5E9','#06B6D4','#14B8A6','#10B981','#22C55E'],
    'المرحلة الثالثة': ['#64748B','#6B7280','#4B5563','#374151','#475569','#0F172A','#1E293B','#334155','#0284C7','#0369A1','#075985','#0C4A6E','#1D4ED8'],
}
stage_counters = {'المرحلة الأولى': 0, 'المرحلة الثانية': 0, 'المرحلة الثالثة': 0}

# ID generator from Arabic name
def make_id(name):
    mapping = {
        'مخلفات البناء': 'construction_waste',
        'تسوير مواقع الأعمال الإنشائية': 'construction_site_fencing',
        'الحواجز المؤقتة في مواقع العمل': 'temp_barriers',
        'تغطية المباني تحت الإنشاء': 'building_under_construction',
        'أعمدة الإنارة': 'lighting_poles',
        'المركبات المهملة والتالفة': 'abandoned_vehicles',
        'اللوحات التجارية': 'commercial_signs',
        'مداخن التهوية في المطاعم': 'restaurant_vents',
        'أثاث الشوارع': 'street_furniture',
        'الكتابات المشوهة للجدران': 'wall_graffiti',
        'الحاويات وتكدس النفايات': 'waste_containers',
        'حفر الشوارع والطرق': 'street_excavation',
        'اللوحات الإرشادية': 'directional_signs',
        'الأرصفة المتهالكة': 'sidewalks',
        'النظافة العامة': 'general_cleanliness',
        'التشوين': 'illegal_storage',
        'نقل مواد البناء': 'material_transport',
        'الهناجر المخالفة فوق السطوح': 'roof_hangars',
        'تكسيات المباني المتهالكة': 'building_cladding',
        'مجاري وتمديدات التكييف': 'ac_pipes',
        'أطباق الأقمار الاصطناعية': 'satellite_dishes',
        'المظلات والخيام': 'canopies',
        'تغطية الشرفات': 'balcony_coverage',
        'اللوحات الإعلانية': 'advertising_boards',
        'البائعين الجائلين': 'street_vendors',
        'اللوحات التحذيرية': 'warning_signs',
        'دورات المياه العامة': 'public_restrooms',
        'دهان البردورات': 'curb_painting',
        'المحولات الكهربائية في الشوارع': 'electrical_transformers',
        'المطبات العشوائية': 'illegal_speed_bumps',
        'المساحات المخصصة للتشجير': 'green_spaces',
        'عدم دهان العلامات الأرضية': 'road_markings',
        'واجهات المباني المتهالكة': 'building_facades',
        'أعمدة الاتصالات': 'telecom_poles',
        'مشاريع الخدمات والحفريات': 'utility_excavations',
        'الأحواض الزراعية': 'agricultural_basins',
        'المباني المهجورة': 'abandoned_buildings',
        'الأسوار': 'fences',
        'الحدائق والملاعب المهجورة': 'abandoned_parks',
        'تسوير الأراضي البيضاء': 'vacant_land_fencing',
        'الأعمدة والأسالك الكهربائية': 'electrical_wires',
        'تسرب المياه': 'water_leaks',
    }
    return mapping.get(name, re.sub(r'\s+', '_', name)[:30])

out = []
out.append('// AUTO-GENERATED from VP_regulation.xlsx — DO NOT EDIT MANUALLY')
out.append('export const regulationData = [')

for el_name in elements_order:
    el = elements_seen[el_name]
    stage = el['stage']
    idx = stage_counters.get(stage, 0)
    colors = stage_colors.get(stage, ['#6B7280'])
    color = colors[idx % len(colors)]
    stage_counters[stage] = idx + 1
    el_id = make_id(el_name)
    max_fine = max((a['fineAmana'] for a in el['articles'] if isinstance(a['fineAmana'], (int,float))), default=0)

    out.append(f'  {{')
    def s(v): return json.dumps(v, ensure_ascii=False)
    out.append(f'    id: {s(el_id)},')
    out.append(f'    name: {s(el_name)},')
    out.append(f'    stage: {s(stage)},')
    out.append(f'    color: {s(color)},')
    out.append(f'    maxFine: {max_fine},')
    out.append(f'    articles: [')
    for a in el['articles']:
        out.append(f'      {{')
        out.append(f'        id: {s(el_id + "_" + str(a["seq"]))},')
        out.append(f'        seq: {a["seq"]},')
        out.append(f'        text: {s(a["text"])},')
        out.append(f'        ref: {s(a["ref"])},')
        out.append(f'        unit: {s(a["unit"])},')
        out.append(f'        responsible: {s(a["responsible"])},')
        out.append(f'        notice: {s(a["notice"])},')
        out.append(f'        severity: {s(a["severity"])},')
        out.append(f'        period: {s(a["period"])},')
        out.append(f'        fineAmana: {a["fineAmana"]},')
        out.append(f'        fineMunicipality: {a["fineMunicipality"]},')
        out.append(f'        punishment: {s(a["punishment"])},')
        out.append(f'        repeat: {s(a["repeat"])},')
        out.append(f'      }},')
    out.append(f'    ],')
    out.append(f'  }},')

out.append(']')
out.append('')

print('\n'.join(out))

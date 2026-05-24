import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function UrbanAIDashboard() {
  const [query, setQuery] = useState("");

  // يمكنك لاحقاً استبدال هذا بشعار الأمانة الحقيقي
  const LOGO_URL = "public/logo.jpeg";
  const ENTITY_NAME = "أمانة الباحة";

  return (
    <div className="h-screen w-full bg-gray-950 text-white flex flex-col">
      {/* HEADER */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <img src={LOGO_URL} alt="logo" className="w-10 h-10 rounded" />
          <div>
            <h1 className="font-bold text-lg">{ENTITY_NAME}</h1>
            <p className="text-xs text-gray-400">Urban Intelligence Platform</p>
          </div>
        </div>
        <div className="text-sm text-gray-300">نظام الرصد والتشوهات البصرية</div>
      </div>

      {/* BODY */}
      <div className="grid grid-cols-12 gap-3 p-3 flex-1">

        {/* LEFT: Org + Users */}
        <div className="col-span-2 bg-gray-900 rounded-xl p-3 overflow-auto">
          <h2 className="font-bold mb-2">الهيكل التنظيمي</h2>
          <ul className="text-xs space-y-1 text-gray-300">
            <li>🏛 {ENTITY_NAME}</li>
            <li className="ml-2">├ بلدية شمال</li>
            <li className="ml-4">├ إدارة الرقابة</li>
            <li className="ml-4">└ إدارة المشاريع</li>
          </ul>

          <h3 className="mt-4 font-bold">المستخدمون</h3>
          <div className="text-xs space-y-1 mt-2">
            <p>👤 مراقب - أحمد</p>
            <p>👤 مدقق - سارة</p>
            <p>👤 مدير - خالد</p>
          </div>
        </div>

        {/* MAP */}
        <div className="col-span-6 bg-gray-900 rounded-xl p-3">
          <h2 className="font-bold mb-2">🗺 الخريطة الذكية</h2>
          <div className="h-[90%] bg-gray-800 rounded-xl flex items-center justify-center">
            <p className="text-gray-400">Mapbox / GIS Heatmap Placeholder</p>
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="col-span-4 flex flex-col gap-3">

          {/* AI */}
          <Card className="bg-gray-900 text-white">
            <CardContent className="p-3">
              <h2 className="font-bold">🤖 Agent AI</h2>
              <Input
                placeholder="اسأل النظام عن المخالفات..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="mt-2 text-black"
              />
              <Button className="w-full mt-2">تحليل</Button>
              <p className="text-xs text-gray-400 mt-2">
                تحليل مكاني - توقع مالي - تقارير ذكية
              </p>
            </CardContent>
          </Card>

          {/* Finance */}
          <Card className="bg-gray-900 text-white">
            <CardContent className="p-3">
              <h2 className="font-bold">💰 التوقع المالي</h2>
              <p>إجمالي المخالفات: 120</p>
              <p>الغرامات المتوقعة: 85,000 ريال</p>
              <p>سيناريو التكرار: +35%</p>
            </CardContent>
          </Card>

          {/* Performance */}
          <Card className="bg-gray-900 text-white">
            <CardContent className="p-3">
              <h2 className="font-bold">📊 أداء الإدارات</h2>
              <p>بلدية الشمال: 92%</p>
              <p>بلدية الجنوب: 78%</p>
              <p>متوسط الإغلاق: 4 أيام</p>
            </CardContent>
          </Card>

        </div>
      </div>

      {/* FOOTER GOVERNANCE */}
      <div className="bg-gray-900 border-t border-gray-800 p-3 flex justify-between text-xs">
        <div>🔐 نظام الحوكمة: يمنع خروج الموظف بوجود مهام مفتوحة</div>
        <div className="flex gap-3">
          <Button size="sm">المستخدمين</Button>
          <Button size="sm">التقارير</Button>
          <Button size="sm">سجل التدقيق</Button>
        </div>
      </div>
    </div>
  );
}
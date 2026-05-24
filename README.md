# منصة الرصد الذكي للتشوه البصري — Urban Visual Intelligence & Compliance Platform

> **أمانة الباحة** · نظام متكامل لرصد وإدارة التشوه البصري في المناطق الحضرية باستخدام الذكاء الاصطناعي

---

## نظرة عامة

منصة ذكية مبنية لأمانة الباحة لرصد مخالفات التشوه البصري وإدارة دورة حياتها الكاملة — من لحظة الرصد الأولى عبر الذكاء الاصطناعي حتى الإغلاق النهائي وتحصيل الغرامات.

---

## المميزات الرئيسية

| الميزة | الوصف |
|--------|--------|
| **لوحة تحكم GIS** | خريطة تفاعلية مركزية مع تجميع تلقائي للبلاغات وطبقات حرارية |
| **مساعد ذكي مدمج** | Agentic AI داخل لوحة التحكم — استعلامات طبيعية + رسوم بيانية |
| **تحليل المرئيات** | رفع صور/فيديو واكتشاف عناصر التشوه بالذكاء الاصطناعي مع bounding boxes |
| **إدارة البلاغات** | دورة حياة 9 مراحل — إنشاء → تدقيق → اعتماد → إسناد → معالجة → إغلاق |
| **اللائحة الديناميكية** | استيراد PDF/Excel/JSON للائحة الغرامات وربطها تلقائياً بعناصر البلاغات |
| **التوقع المالي** | محرك تحليل الغرامات مع سيناريوهات الأساس والتكرار |
| **إدارة المستخدمين** | هيكل تنظيمي كامل مع RBAC — أمانة → بلدية → وكالة → إدارة → قسم |
| **سجل التدقيق** | تتبع جميع الأنشطة متوافق مع متطلبات NCA |

---

## هيكل المشروع

```
urban-ai/
├── frontend/               # React 18 + Vite + Tailwind CSS v4
│   ├── src/
│   │   ├── pages/          # Dashboard, GISMap, ReportsBasket, Users, …
│   │   ├── components/     # Layout (Sidebar, Header), shared UI
│   │   ├── context/        # ThemeContext, AuthContext
│   │   ├── data/           # mockData.js (عناصر، بلاغات، مستخدمون)
│   │   └── lib/            # utils
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── backend/                # Node.js + Express API (scaffold)
│   ├── src/
│   │   ├── routes/         # reports, users, violations
│   │   ├── services/       # business logic
│   │   ├── middleware/     # auth (JWT)
│   │   └── models/         # database models
│   └── package.json
├── .env.example
├── .gitignore
└── README.md
```

---

## متطلبات التشغيل

- **Node.js** v20+
- **npm** v10+ أو **pnpm** v9+
- (اختياري) PostgreSQL 15+ للـ backend

---

## تشغيل الـ Frontend

```bash
cd frontend
npm install
npm run dev
# يفتح على http://localhost:5173
```

### بيانات الدخول التجريبية

| المستخدم | كلمة المرور | الصلاحية |
|----------|-------------|-----------|
| `r.shehri@albaha.gov.sa` | `admin123` | مدير النظام |
| `s.ghamdi@albaha.gov.sa` | `audit123` | مدقق |
| `a.salmi@albaha.gov.sa` | `monitor123` | مراقب ميداني |
| `k.omari@albaha.gov.sa` | `manager123` | مدير إدارة |

---

## تشغيل الـ Backend

```bash
cd backend
cp ../.env.example .env
# عدّل قيم .env (DATABASE_URL, JWT_SECRET, …)
npm install
npm run dev
# يعمل على http://localhost:3001
```

---

## Stack التقني

**Frontend**
- React 18 + Vite 8
- Tailwind CSS v4 (class-based dark mode)
- React Router v6
- React Leaflet + react-leaflet-cluster (GIS maps)
- Recharts (data visualization)
- Lucide React (icons)
- خط Tajawal — Google Fonts

**Backend** *(scaffold — جاهز للتطوير)*
- Node.js + Express
- PostgreSQL (pg)
- JWT authentication
- Multer (file uploads)

---

## صفحات النظام

| المسار | الصفحة |
|--------|--------|
| `/` | لوحة التحكم — GIS + مساعد ذكي مدمج |
| `/reports` | سلة البلاغات |
| `/reports/:id` | تفاصيل البلاغ |
| `/map` | الخريطة الذكية الموسعة |
| `/analyze` | تحليل المرئيات بالذكاء الاصطناعي |
| `/violations` | اللائحة والغرامات |
| `/financial` | التوقع المالي |
| `/users` | إدارة المستخدمين |
| `/audit` | سجل التدقيق |

---

## خارطة الطريق

- [ ] ربط backend حقيقي مع PostgreSQL
- [ ] نموذج AI فعلي لكشف التشوه البصري (YOLO / Claude Vision)
- [ ] تطبيق جوال (React Native) للمراقبين الميدانيين
- [ ] نظام إشعارات فوري (WebSockets)
- [ ] تكامل مع منظومة بلدي وأبشر
- [ ] تقارير PDF تلقائية بختم رسمي
- [ ] لوحة تحكم إضافية للجهات الخارجية

---

## الترخيص

هذا المشروع مخصص لأمانة الباحة — جميع الحقوق محفوظة.

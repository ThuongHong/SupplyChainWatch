# **📊 ĐỒ ÁN MÔN HỌC: DATA MONITORING & ANALYTICS APPLICATION**

## **1\. 🎯 Mô tả tổng quan**

Trong đồ án này, sinh viên sẽ làm việc theo nhóm (4–6 người) để xây dựng một **ứng dụng phân tích và giám sát dữ liệu (Data Monitoring App)** cho một lĩnh vực cụ thể.

Ứng dụng cần:

* Thu thập dữ liệu thực tế (real-world data) từ một hoặc nhiều nguồn
* Xử lý và lưu trữ dữ liệu
* Trực quan hóa dữ liệu dưới dạng dashboard
* Quan trọng nhất: **phân tích và rút ra insight có giá trị**

Ví dụ chủ đề:

* Monitor giá vàng (Gold Price Monitoring)
* Monitor giá xăng dầu
* Monitor giá crypto (Bitcoin, Ethereum…)
* Monitor thời tiết
* Monitor chứng khoán (VNIndex, cổ phiếu cụ thể)
* Monitor giá nhà đất

---

## **2\. 🧩 Mục tiêu học tập**

Sau đồ án, sinh viên cần đạt được:

* Hiểu và triển khai **data pipeline end-to-end**
* Biết cách **thu thập dữ liệu (API / crawling / scraping)**
* Thực hiện **EDA (Exploratory Data Analysis)**
* Xây dựng **dashboard trực quan**
* Quan trọng: **đưa ra insight & giải thích dữ liệu (data storytelling)**

---

## **3\. 🛠️ Yêu cầu hệ thống**

Ứng dụng cần có các thành phần chính:

### **(1) Data Collection**

* Thu thập dữ liệu từ:
  * API (khuyến khích)
  * Web scraping (nếu cần)
* Có thể cập nhật theo:
  * Realtime hoặc batch (theo giờ/ngày)

---

### **(2) Data Processing & Storage**

* Làm sạch dữ liệu (missing, noise, duplicates)
* Chuẩn hóa dữ liệu
* Lưu trữ:
  * CSV / Database (SQLite, PostgreSQL, …)

---

### **(3) Data Analysis (EDA)**

Phải có các phân tích:

* Xu hướng theo thời gian (trend)
* Phân bố dữ liệu (distribution)
* Phát hiện bất thường (anomaly nếu có)
* So sánh theo các yếu tố liên quan

---

### **(4) Visualization Dashboard**

Xây dựng dashboard (web app hoặc notebook interactive):

* Biểu đồ thời gian (time series)
* Biểu đồ so sánh
* Filter theo thời gian / điều kiện

Gợi ý công cụ:

* Python: Streamlit / Dash
* BI: Power BI / Tableau
* Web: React \+ chart library

---

### **(5) Insight & Interpretation ⭐ (QUAN TRỌNG NHẤT)**

Sinh viên phải trả lời:

* Xu hướng chính của dữ liệu là gì?
* Có pattern nào đáng chú ý?
* Có thể dự đoán hoặc giải thích điều gì?
* Insight có giá trị thực tế gì?

👉 Không chỉ vẽ chart — phải **giải thích và kết luận**

---

## **4\. 📦 Sản phẩm cuối cùng**

Mỗi nhóm cần nộp:

1. 📄 Report (PDF)
* Problem
* Data pipeline
* EDA
* Insight
* Conclusion
2. 💻 Source code
* Data collection
* Processing
* Dashboard
3. 📊 Slide presentation
4. 🎥 Demo (video hoặc live)

---

## **6\. 📏 Tiêu chí đánh giá**

| Tiêu chí | Trọng số |
| ----- | ----- |
| Data pipeline & data quality | 20% |
| EDA & analysis | 20% |
| Dashboard & visualization | 20% |
| Insight & interpretation ⭐ | 30% |
| Presentation & report | 10% |

---

## **7\. 🚫 Lưu ý quan trọng**

* Không chấp nhận:
  * Chỉ vẽ biểu đồ mà **không có insight**
  * Dataset quá nhỏ / không rõ nguồn
* Khuyến khích:
  * Có yếu tố dự đoán (forecast)
  * So sánh đa nguồn
  * Phân tích có chiều sâu

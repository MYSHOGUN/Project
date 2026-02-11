FROM node:20

# กำหนดโฟลเดอร์ทำงาน
WORKDIR /usr/src/app

# คัดลอกไฟล์จัดการ package ก่อนเพื่อความเร็วในการ Build
COPY package*.json ./
RUN npm install

# คัดลอกโค้ดทั้งหมด (รวมถึงโฟลเดอร์ app1 และ models)
COPY . .

# Cloud Run บังคับใช้ Port 8080 เป็นค่าเริ่มต้น
ENV PORT=8080
EXPOSE 8080

# คำสั่งรัน
CMD [ "node", "server.js" ]
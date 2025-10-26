// Lokasi: tesseranavis-backend/index.js

const express = require('express');
const axios = require('axios');
const { Buffer } = require('buffer'); // Diperlukan untuk Buffer.from

const app = express();
const port = 3000;

app.use(express.json());

// Kunci rahasia Xendit Anda
const XENDIT_SECRET_KEY = "xnd_development_0RGTKg2QbbgkuXkZaoDUBkUq7rse4n8FsD2ApPkl6px9fAiAe5ap1Ts27OsC4";

// Header otentikasi untuk Xendit
const xenditHeaders = {
  'Authorization': 'Basic ' + Buffer.from(XENDIT_SECRET_KEY + ':').toString('base64'),
  'Content-Type': 'application/json',
};


// URL dasar ke server PHP Anda (tanpa /pembayaran)
const PHP_SERVER_URL = "http://10.220.162.164/api_tesseranavis";


// =================================================================
// ==         KODE LAMA ANDA UNTUK INVOICE TIKET (AMAN)           ==
// ==                  (TIDAK ADA PERUBAHAN)                      ==
// =================================================================
app.post('/create-invoice', async (req, res) => {
  try {
    const { totalHarga, emailPelanggan, kodeBooking } = req.body;
    if (!kodeBooking) throw new Error('kodeBooking tidak diterima.');

    const invoiceData = {
      external_id: kodeBooking.trim(),
      amount: totalHarga,
      payer_email: emailPelanggan,
      description: `Tiket Kapal Tessera Navis - Booking ID: ${kodeBooking}`,
      success_redirect_url: 'tesseranavis://payment-success',
      failure_redirect_url: 'https://xendit.co/failure',
    };
    
    const response = await axios.post('https://api.xendit.co/v2/invoices', invoiceData, { headers: xenditHeaders });
    res.json({ invoice_url: response.data.invoice_url });
  } catch (error) {
    const errorMessage = error.response ? error.response.data : error.message;
    console.error("Error saat membuat invoice tiket:", errorMessage);
    res.status(500).json({ error: "Gagal membuat invoice tiket", details: errorMessage });
  }
});


// =================================================================
// ==         KODE BARU YANG DITAMBAHKAN UNTUK TOP UP             ==
// =================================================================
app.post('/create-topup-invoice', async (req, res) => {
  try {
    const { idUser, emailPelanggan, jumlah } = req.body;
    if (!idUser || !jumlah) throw new Error('idUser atau jumlah tidak diterima.');

    // Membuat external_id yang unik dan mudah dikenali untuk Top Up
    // Format: TOPUP-IDUSER-TIMESTAMP
    const external_id = `TOPUP-${idUser}-${Date.now()}`;

    const invoiceData = {
      external_id: external_id,
      amount: jumlah,
      payer_email: emailPelanggan,
      description: `Top Up Saldo Dompet TesseraNavis sebesar Rp ${new Intl.NumberFormat('id-ID').format(jumlah)}`,
      success_redirect_url: 'tesseranavis://payment-success',
      failure_redirect_url: 'https://xendit.co/failure',
    };

    const response = await axios.post('https://api.xendit.co/v2/invoices', invoiceData, { headers: xenditHeaders });
    res.json({ invoice_url: response.data.invoice_url });
  } catch (error) {
    const errorMessage = error.response ? error.response.data : error.message;
    console.error("Error saat membuat invoice Top Up:", errorMessage);
    res.status(500).json({ error: "Gagal membuat invoice Top Up", details: errorMessage });
  }
});


// =================================================================
// ==     WEBHOOK XENDIT YANG DIPERBARUI (DENGAN LOGIKA IF/ELSE)   ==
// =================================================================
app.post('/xendit-webhook', async (req, res) => {
  const data = req.body;
  console.log("---------------------------------");
  console.log("🎉 Webhook dari Xendit Diterima!");
  
  if (data && data.status === 'PAID') {
    const externalId = data.external_id;

    // --- LOGIKA BARU: Cek apakah ini pembayaran Top Up atau pembayaran Tiket ---
    if (externalId.startsWith('TOPUP-')) {
      // INI ADALAH LOGIKA BARU UNTUK TOP UP
      const parts = externalId.split('-');
      const idUser = parts[1];
      const jumlah = data.paid_amount;

      console.log(`💸 Top Up untuk User ID ${idUser} sebesar Rp ${jumlah} telah LUNAS.`);
      
      try {
        console.log(`Mengirim permintaan update saldo ke PHP...`);
        // Kirim permintaan ke API PHP baru untuk mengupdate saldo
        const phpResponse = await axios.post(
          `${PHP_SERVER_URL}/dompet/update_saldo.php`, // <-- API PHP baru
          {
            id_user: idUser,
            jumlah: jumlah,
            kode_referensi: externalId,
          },
          { headers: { 'Content-Type': 'application/json' } }
        );
        console.log("✅ Berhasil mengirim update saldo ke server PHP. Balasan:", phpResponse.data);
      } catch (error) {
        console.error("❌ Gagal mengirim update saldo ke server PHP:", error.response ? error.response.data : error.message);
      }

    } else {
      // INI ADALAH KODE LAMA ANDA UNTUK PEMBAYARAN TIKET (AMAN & TIDAK DIUBAH)
      const kodeBooking = externalId;
      console.log(`✅ Pesanan dengan Kode Booking ${kodeBooking} telah LUNAS.`);
      console.log(`Mengecek kodeBooking: |${kodeBooking}|`);
      console.log(`Panjang kodeBooking: ${kodeBooking.length}`);
      
      try {
        console.log(`Mengirim permintaan update status tiket ke PHP...`);
        const phpResponse = await axios.post(
          `${PHP_SERVER_URL}/pembayaran/update_status.php`, // <-- URL Lama Anda
          {
            kode_booking: kodeBooking,
            status: 'berhasil'
          },
          { headers: { 'Content-Type': 'application/json' } }
        );
        console.log("✅ Berhasil mengirim update status tiket ke server PHP. Balasan dari PHP:", phpResponse.data);
      } catch (error) {
        console.error("❌ Gagal mengirim update status tiket ke server PHP:", error.message);
      }
    }
  }
  
  res.status(200).send('OK');
});


app.listen(port, () => {
  console.log(`Server backend Xendit berjalan di http://localhost:${port}`);
});
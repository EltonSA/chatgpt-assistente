const express = require('express');
const fs = require('fs');
const path = require('path');
const venom = require('venom-bot');
const axios = require('axios');
const bodyParser = require('body-parser');
const banco = require('./src/banco');

const app = express();
const port = 3000;

let clientInstance;
let apiKey = '';
let treinamento = '';
let assistentes = [];  // Lista de assistentes

app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));

// Verifica e cria o diretório 'images' se não existir
const imagesDir = path.join(__dirname, 'images');
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir);
}

// Função para iniciar o Venom Bot
async function startVenomBot() {
  try {
    clientInstance = await venom.create(
      'chatGPT_BOT',
      (base64Qr, asciiQR, attempts, urlCode) => {
        console.log(asciiQR); // Optional to log the QR in the terminal
        const matches = base64Qr.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (matches.length !== 3) {
          throw new Error('Invalid input string');
        }
        const imageBuffer = Buffer.from(matches[2], 'base64');
        const filePath = path.join(imagesDir, 'qrcode.png');
        fs.writeFile(filePath, imageBuffer, 'binary', function(err) {
          if (err) {
            console.error('Erro ao salvar o arquivo:', err);
          } else {
            console.log('QR Code salvo em:', filePath);
          }
        });
      },
      undefined,
      { logQR: false }
    );

    console.log('Cliente inicializado.'); // Mensagem de cliente inicializado

    start(clientInstance); // Inicia o processamento das mensagens

  } catch (error) {
    console.error('Erro ao iniciar o Venom Bot:', error);
  }
}

// Rota para exibir a página inicial
app.get('/', (req, res) => {
  res.render('index');
});

// Rota para exibir a página de configuração
app.get('/configure', (req, res) => {
  res.render('configure');
});

// Rota para processar as configurações enviadas pelo formulário
app.post('/configure', (req, res) => {
  apiKey = req.body.apiKey;
  const assistantName = req.body.assistantName;
  treinamento = `Nome da Assistente: ${assistantName}\n${req.body.treinamento}`;
  assistentes.push({ apiKey, treinamento });
  console.log('API Key e Treinamento configurados');
  generateQRCode(req, res);
  res.send({ success: true, redirectUrl: '/assistants', qrCodeUrl: '/qrcode' });
});

// Função para gerar o QR Code e redirecionar para a página que exibe o QR Code
function generateQRCode(req, res) {
  if (!clientInstance) {
    startVenomBot(); // Inicia o Venom Bot se ainda não estiver inicializado
    return;
  }

  // Lógica para gerar o QR Code
  res.redirect('/qrcode');
}

// Rota para enviar o QR Code gerado pelo Venom Bot e salvá-lo na pasta images
app.get('/qrcode', (req, res) => {
  const filePath = path.join(imagesDir, 'qrcode.png');
  res.sendFile(filePath);
});

// Rota para exibir a página "Assistants"
app.get('/assistants', (req, res) => {
  res.render('assistants', { assistentes });
});

const header = {
  "Content-Type": "application/json",
  "Authorization": ""
};

// Função para iniciar o processamento das mensagens
const start = (client) => {
  client.onMessage((message) => {
    const userCadastrado = banco.db.find(numero => numero.num === message.from);
    if (!userCadastrado) {
      console.log("Cadastrando usuário");
      banco.db.push({num: message.from, historico: []});
    } else {
      console.log("Usuário já cadastrado");
    }

    const historico = banco.db.find(num => num.num === message.from);
    historico.historico.push("user: " + message.body);
    console.log(historico);

    console.log(banco.db);

    axios.post("https://api.openai.com/v1/chat/completions", {
      "model": "gpt-3.5-turbo",
      "messages": [
        {"role": "system", "content": treinamento},
        {"role": "system", "content": "histórico de conversas: " + historico.historico},
        {"role": "user", "content": message.body }
      ]
    }, {
      headers: { ...header, "Authorization": `Bearer ${apiKey}` }
    })
    .then((response)=>{
      console.log(response.data.choices[0].message.content);
      historico.historico.push("assistent: " + response.data.choices[0].message.content);
      client.sendText(message.from, response.data.choices[0].message.content);
    })
    .catch((err)=>{
      console.log(err);
    });
  });
};

// Inicia o servidor
app.listen(port, () => {
  console.log(`App listening at http://localhost:${port}`);
});

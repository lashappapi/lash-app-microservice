require('dotenv').config();
const axios = require('axios');
const SibApiV3Sdk = require('sib-api-v3-sdk');
const cron = require('node-cron');
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Configuração do serviço de email (Brevo)
const defaultClient = SibApiV3Sdk.ApiClient.instance;
const apiKey = defaultClient.authentications['api-key'];
apiKey.apiKey = process.env.API_SENDINBLUE_KEY;
const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

const sendNotificationEmail = (email, nome, message) => {
  const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
  
  sendSmtpEmail.to = [{ email: email }];
  sendSmtpEmail.sender = { name: 'Lash App', email: 'lashappapi@gmail.com' };
  sendSmtpEmail.subject = 'Notificação Diária de Tarefas e Agendamentos - Lash App';
  sendSmtpEmail.htmlContent = `
  <html>
  <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
      <h2 style="color: #C378DC;">Bom dia, ${nome}!</h2>
      <p>Esperamos que seu dia seja ótimo! Aqui está um resumo de seus agendamentos e tarefas para hoje :)</p>
      
      <div style="margin-top: 20px;">
        <h3 style="color: #333; border-bottom: 2px solid #C378DC; padding-bottom: 5px;">Agendamentos de Hoje</h3>
        ${message.appointments.length > 0 ? 
          `<ul style="list-style: none; padding: 0;">${message.appointments.map(app => `
            <li style="background: #f9f9f9; padding: 10px; margin-bottom: 10px; border-radius: 5px;">
              <strong>Procedimento:</strong> ${app.procedure} <br>
              <strong>Hora:</strong> ${app.time} <br>
              <strong>Cliente:</strong> ${app.client.name}
            </li>`).join('')}
          </ul>` 
          : `<p style="color: #777;">Não há agendamentos para hoje.</p>`}
      </div>

      <div style="margin-top: 20px;">
        <h3 style="color: #333; border-bottom: 2px solid #C378DC; padding-bottom: 5px;">Tarefas de Hoje</h3>
        ${message.tasks.length > 0 ? 
          `<ul style="list-style: none; padding: 0;">${message.tasks.map(task => `
            <li style="background: #f9f9f9; padding: 10px; margin-bottom: 10px; border-radius: 5px;">
              <strong>Tarefa:</strong> ${task.name} <br>
              <strong>Hora:</strong> ${task.time}
            </li>`).join('')}
          </ul>`
          : `<p style="color: #777;">Não há tarefas para hoje.</p>`}
      </div>

      <p style="font-size: 14px; color: #777;">Tenha um ótimo dia!</p>
      
      <p style="font-size: 14px; color: #777;">Atenciosamente, <br><strong>Equipe Lash App</strong></p>
    </div>
  </body>
  </html>
  `;

  apiInstance.sendTransacEmail(sendSmtpEmail).then(
    function (data) {
      console.log('Email enviado com sucesso:', data);
    },
    function (error) {
      console.error('Erro ao enviar email:', error);
    }
  );
};

const authenticate = async () => {
  try {
    const response = await axios.post(`${process.env.API_BASE_URL}/login`, {
      username: process.env.API_USERNAME,
      password: process.env.API_PASSWORD
    });

    const token = response.data.token;
    console.log('Token JWT obtido com sucesso.');
    return token;
  } catch (error) {
    console.error('Erro ao autenticar:', error.message);
    throw new Error('Falha na autenticação.');
  }
};

// Função para deslogar (emular a remoção de token do "localStorage")
const logout = async (token) => {
  try {
    await axios.get(`${process.env.API_BASE_URL}/logout`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Logout realizado com sucesso.');
  } catch (error) {
    console.error('Erro ao deslogar:', error.message);
  }
};

// Função para obter tarefas e agendamentos do dia
const getDailyTasksAndAppointments = async (token) => {
  try {
    // Configura o cabeçalho de autorização
    const config = {
      headers: { Authorization: `Bearer ${token}` }
    };

    // Obtém agendamentos do dia
    const appointmentsResponse = await axios.get(`${process.env.API_BASE_URL}/api/appointments`, {
      ...config,
      params: { date: new Date().toISOString().split('T')[0] } // Data de hoje no formato 'YYYY-MM-DD'
    });

    // Obtém tarefas do dia
    const tasksResponse = await axios.get(`${process.env.API_BASE_URL}/api/tasks`, {
      ...config,
      params: { date: new Date().toISOString().split('T')[0] } // Data de hoje no formato 'YYYY-MM-DD'
    });

    return {
      appointments: appointmentsResponse.data.appointments,
      tasks: tasksResponse.data.tasks
    };
  } catch (error) {
    console.error('Erro ao buscar tarefas e agendamentos:', error.message);
    throw new Error('Falha ao buscar dados.');
  }
};

// Função para preparar e enviar o email de notificação
const sendDailyNotification = async () => {
  try {
    // 1. Autenticar e obter o token JWT
    const token = await authenticate();

    // 2. Obter as tarefas e agendamentos do dia
    const { appointments, tasks } = await getDailyTasksAndAppointments(token);

    // 3. Definir o nome do destinatário
    const nomeDestinatario = 'Livia'; // Defina o nome do destinatário aqui

    // 4. Montar a mensagem do email de forma mais profissional
    let message = {
      appointments: appointments.length > 0 ? appointments : [],
      tasks: tasks.length > 0 ? tasks : []
    };

    // 5. Enviar o email
    sendNotificationEmail(process.env.EMAIL_TO_NOTIFY, nomeDestinatario, message);

    // 6. Deslogar (remover o token)
    await logout(token);
  } catch (error) {
    console.error('Erro ao enviar notificação diária:', error.message);
  }
};

// Agendamento para teste a cada 10 segundos
// cron.schedule('*/50 * * * * *', () => {  // '*/10 * * * * *' significa "a cada 10 segundos"
//   console.log('Executando tarefa agendada para enviar notificação de teste a cada 50 segundos...');
//   sendDailyNotification();
// }, {
//   timezone: "America/Sao_Paulo" // Defina o fuso horário desejado
// });

// Agendamento diário às 5h00 da manhã
cron.schedule('0 5 * * *', () => {
  console.log('Realizando procedimento de envio de email...');
  sendDailyNotification();
}, {
  timezone: "America/Sao_Paulo"
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}...`);
});

// Rota fake de GET para manter a conexão
  setInterval(() => {
    axios.get(`${process.env.API_BASE_URL}/api/get`)
      .then(response => {
        console.log('GET realizado com sucesso');
      })
      .catch(error => {
        console.error('GET feito.');
      });
  }, 1 * 60 * 1000);  // 1 minuto em milissegundos
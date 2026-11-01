// Teste de força de login imediato
console.log('[DEBUG] O arquivo index.js começou a ser executado!');
const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes } = require('discord.js');
const express = require('express');
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');
const fs = require('fs');

// Garante que o arquivo database.json existe para evitar erros de leitura
if (!fs.existsSync('database.json')) {
    fs.writeFileSync('database.json', JSON.stringify({ keys: [], users: [] }, null, 2));
}

// Configuração moderna do Lowdb v7+
const adapter = new JSONFile('database.json');
const db = new Low(adapter, { keys: [], users: [] });

async function initDB() {
    await db.read();
    db.data ||= { keys: [], users: [] };
    await db.write();
}

const app = express();
app.use(express.json());

// API de Autenticação / Login / Registro
app.post('/api/auth', async (req, res) => {
    await db.read();
    const { username, password, key } = req.body;

    // Tenta achar usuário existente
    const user = db.data.users.find(u => u.username === username);

    if (user) {
        if (user.password !== password) {
            return res.status(400).json({ success: false, message: 'Senha incorreta!' });
        }

        if (Date.now() > user.expiresAt) {
            return res.status(403).json({ success: false, message: 'Sua assinatura expirou!' });
        }

        const diasRestantes = Math.ceil((user.expiresAt - Date.now()) / (1000 * 60 * 60 * 24));
        return res.json({ success: true, message: 'Login realizado com sucesso!', dias: diasRestantes });
    } 
    else {
        if (!key) {
            return res.status(400).json({ success: false, message: 'Usuário não existe. Insira uma Key válida para registrar.' });
        }

        const dbKey = db.data.keys.find(k => k.key === key && !k.used);
        if (!dbKey) {
            return res.status(400).json({ success: false, message: 'Key inválida ou já utilizada!' });
        }

        const expiresAt = Date.now() + (dbKey.dias * 24 * 60 * 60 * 1000);

        // Queima a key e registra o usuário
        dbKey.used = true;
        dbKey.user = username;
        db.data.users.push({ username: username, password: password, expiresAt: expiresAt });
        await db.write();

        return res.json({ success: true, message: 'Conta criada e ativada com sucesso!', dias: dbKey.dias });
    }
});

const PORT = process.env.PORT || 10000;

// Bot do Discord
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const CLIENT_ID = "1563624728646783027";

client.once('ready', async () => {
    console.log(`[BOT] ${client.user.tag} online!`);
    const commands = [
        new SlashCommandBuilder()
            .setName('gerarkey')
            .setDescription('Gera uma key de acesso para o Gab Storm')
            .addIntegerOption(opt => opt.setName('dias').setDescription('Dias de acesso').setRequired(true))
    ].map(cmd => cmd.toJSON());

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('[BOT] Comandos Slash registrados com sucesso!');
    } catch (error) {
        console.error('[BOT] Erro ao registrar comandos:', error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'gerarkey') {
        await db.read();
        const dias = interaction.options.getInteger('dias');
        const randomKey = 'GAB-' + Math.random().toString(36).substring(2, 8).toUpperCase() + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();

        db.data.keys.push({ key: randomKey, dias: dias, used: false, user: null });
        await db.write();

        const embed = new EmbedBuilder()
            .setColor('#121212')
            .setTitle('GAB STORM • Key Criada')
            .addFields(
                { name: 'Key:', value: `\`${randomKey}\`` },
                { name: 'Duração:', value: `${dias} Dia(s)` }
            )
            .setFooter({ text: 'Gab Storm Security • dev Vitor ‧ Gxblin' });

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
});

// Inicializa o banco, o servidor Express e o Bot do Discord apenas uma vez
initDB().then(() => {
    app.listen(PORT, () => console.log(`[API] Servidor Gab Storm rodando na porta ${PORT}`));
    
    client.login(process.env.DISCORD_TOKEN).then(() => {
        console.log('[BOT] Bot conectado com sucesso!');
    }).catch(err => {
        console.error('[BOT] Erro ao fazer login no Discord:', err);
    });
});

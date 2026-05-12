const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

const pool = new Pool({
    user: process.env.PGUSER || 'postgres',
    host: process.env.PGHOST || 'localhost',
    database: process.env.PGDATABASE || 'Vet clinic',
    password: process.env.PGPASSWORD || '12345',
    port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
});

async function testConnection() {
    try {
        const client = await pool.connect();
        console.log('Успішно підключено до PostgreSQL!');
        client.release();
    } catch (err) {
        console.error('Помилка підключення до PostgreSQL:', err.message);
        process.exit(1);
    }
}

testConnection();

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/pets', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT p.*, o.first_name AS owner_name
            FROM pets p
            LEFT JOIN owners o ON p.owner_id::text = o.owner_id::text
            ORDER BY p.animal_id
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/pets/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(`
            SELECT p.*, o.first_name AS owner_name
            FROM pets p
            LEFT JOIN owners o ON p.owner_id::text = o.owner_id::text
            WHERE p.animal_id = $1
        `, [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Тварина не знайдена' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/pets', async (req, res) => {
    const { name, species, breed, birth_date, owner_name, owner_id } = req.body;
    if (!name || !species) {
        return res.status(400).json({ error: 'Потрібні поля name та species' });
    }

    try {
        let resolvedOwnerId = owner_id || null;
        if (!resolvedOwnerId && owner_name) {
            const ownerResult = await pool.query(
                'SELECT owner_id FROM owners WHERE first_name = $1 LIMIT 1',
                [owner_name]
            );
            if (ownerResult.rows.length > 0) {
                resolvedOwnerId = ownerResult.rows[0].owner_id;
            } else {
                return res.status(404).json({ error: 'owner_not_found', first_name: owner_name });
            }
        }

        const result = await pool.query(
            'INSERT INTO pets (name, species, breed, birth_date, owner_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [name, species, breed || null, birth_date || null, resolvedOwnerId]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Помилка INSERT:', err.message);
        res.status(500).json({ error: `Помилка при додаванні: ${err.message}` });
    }
});

app.put('/api/pets/:id', async (req, res) => {
    const { id } = req.params;
    const { name, species, breed, birth_date, owner_name, owner_id } = req.body;

    try {
        let resolvedOwnerId = owner_id || null;
        if (!resolvedOwnerId && owner_name) {
            const ownerResult = await pool.query(
                'SELECT owner_id FROM owners WHERE first_name = $1 LIMIT 1',
                [owner_name]
            );
            if (ownerResult.rows.length > 0) {
                resolvedOwnerId = ownerResult.rows[0].owner_id;
            } else {
                return res.status(404).json({ error: 'owner_not_found', first_name: owner_name });
            }
        }

        const result = await pool.query(
            'UPDATE pets SET name = $1, species = $2, breed = $3, birth_date = $4, owner_id = $5 WHERE animal_id = $6 RETURNING *',
            [name, species, breed || null, birth_date || null, resolvedOwnerId, id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Тварина не знайдена' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Помилка UPDATE:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/pets/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const result = await pool.query('DELETE FROM pets WHERE animal_id = $1 RETURNING *', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Тварина не знайдена' });
        }
        res.json({ message: 'Тварина видалена', pet: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/owners', async (req, res) => {
    try {
        const { first_name } = req.query;
        if (first_name) {
            const result = await pool.query(
                'SELECT * FROM owners WHERE first_name ILIKE $1 LIMIT 1',
                [first_name]
            );
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'owner_not_found' });
            }
            return res.json(result.rows[0]);
        }
        const result = await pool.query('SELECT * FROM owners ORDER BY first_name, last_name');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/owners', async (req, res) => {
    const { first_name, last_name, phone, email } = req.body;
    if (!first_name) {
        return res.status(400).json({ error: 'Потрібно вказати first_name' });
    }
    try {
        const result = await pool.query(
            'INSERT INTO owners (first_name, last_name, phone, email) VALUES ($1, $2, $3, $4) RETURNING *',
            [first_name, last_name || null, phone || null, email || null]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Помилка INSERT owner:', err.message);
        res.status(500).json({ error: `Помилка при додаванні власника: ${err.message}` });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Сервер запущено на http://localhost:${PORT}`);
});
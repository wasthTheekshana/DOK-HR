import { Request, Response } from 'express';
import { execute } from '../db/dbUtils';
import { hashPassword, comparePassword, generateToken } from '../utils/authUtils';

export const login = async (req: Request, res: Response) => {
    const { epf_number, password } = req.body;

    try {
        const result = await execute<any>(
            `SELECT * FROM users WHERE epf_number = :epf_number`,
            [epf_number]
        );

        if (!result.rows || result.rows.length === 0) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const user = result.rows[0];
        const isMatch = await comparePassword(password, user.PASSWORD);

        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        if (user.STATUS !== 'active') {
            return res.status(403).json({ message: 'Account is inactive' });
        }

        const token = generateToken({ id: user.ID, epf_number: user.EPF_NUMBER, role: user.ROLE });

        // Don't send password back
        const { PASSWORD, ...userWithoutPassword } = user;

        res.json({ token, user: userWithoutPassword });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

export const register = async (req: Request, res: Response) => {
    const { epf_number, name, password, role, site_id } = req.body;

    try {
        const hashedPassword = await hashPassword(password);

        // Check if user exists
        const checkUser = await execute<any>(
            `SELECT id FROM users WHERE epf_number = :epf_number`,
            [epf_number]
        );

        if (checkUser.rows && checkUser.rows.length > 0) {
            return res.status(400).json({ message: 'User already exists' });
        }

        await execute(
            `INSERT INTO users (epf_number, name, password, role, site_id) 
       VALUES (:epf_number, :name, :password, :role, :site_id)`,
            {
                epf_number,
                name,
                password: hashedPassword,
                role,
                site_id: site_id || null
            }
        );

        res.status(201).json({ message: 'User registered successfully' });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

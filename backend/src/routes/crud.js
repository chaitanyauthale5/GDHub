const express = require('express');
function createCrudRouter(Model) {
    const router = express.Router();
    router.get('/', async (req, res) => {
        const filter = { ...req.query };
        Object.keys(filter).forEach((k) => { if (filter[k] === 'true') filter[k] = true; if (filter[k] === 'false') filter[k] = false; });
        const items = await Model.find(filter).sort(req.query.sort || '-createdAt');
        res.json(items);
    });
    router.get('/:id', async (req, res) => {
        const item = await Model.findById(req.params.id);
        if (!item) return res.status(404).json({ message: 'Not found' });
        res.json(item);
    });
    router.post('/', async (req, res) => {
        const created = await Model.create(req.body || {});
        res.status(201).json(created);
    });
    router.patch('/:id', async (req, res) => {
        const updated = await Model.findByIdAndUpdate(req.params.id, req.body || {}, { new: true });
        if (!updated) return res.status(404).json({ message: 'Not found' });
        res.json(updated);
    });
    router.delete('/:id', async (req, res) => {
        const deleted = await Model.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ message: 'Not found' });
        res.json({ success: true });
    });
    return router;
}
module.exports = createCrudRouter;

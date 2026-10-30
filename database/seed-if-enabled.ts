const shouldSeed = process.env.RUN_DATABASE_SEED?.toLowerCase() === 'true';

if (shouldSeed) {
    console.log('[build] RUN_DATABASE_SEED=true, menyiapkan schema dan menjalankan seed...');
    const { applyHostingerSchema } = await import('./apply_hostinger_schema.ts');
    await applyHostingerSchema();
    await import('./seed.ts');
} else {
    console.log('[build] Database seed dilewati (RUN_DATABASE_SEED bukan true).');
}

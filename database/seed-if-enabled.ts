const shouldSeed = process.env.RUN_DATABASE_SEED?.toLowerCase() === 'true';

if (shouldSeed) {
    console.log('[build] RUN_DATABASE_SEED=true, menjalankan database seed...');
    await import('./seed.ts');
} else {
    console.log('[build] Database seed dilewati (RUN_DATABASE_SEED bukan true).');
}

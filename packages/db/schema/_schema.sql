
CREATE TYPE public.pokemon_type AS ENUM (
    'Bug',
    'Dark',
    'Dragon',
    'Electric',
    'Fairy',
    'Fighting',
    'Fire',
    'Flying',
    'Ghost',
    'Grass',
    'Ground',
    'Ice',
    'Normal',
    'Poison',
    'Psychic',
    'Rock',
    'Steel',
    'Water'
);

CREATE TABLE public.effect_sql_migrations (
    migration_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    name text NOT NULL
);

CREATE TABLE public.pokemon (
    id integer NOT NULL,
    name text NOT NULL,
    pokedex_number integer NOT NULL,
    hp integer NOT NULL,
    attack integer NOT NULL,
    defense integer NOT NULL,
    special_attack integer NOT NULL,
    special_defense integer NOT NULL,
    speed integer NOT NULL,
    total integer GENERATED ALWAYS AS ((((((hp + attack) + defense) + special_attack) + special_defense) + speed)) STORED,
    CONSTRAINT pokemon_attack_check CHECK (((attack >= 1) AND (attack <= 255))),
    CONSTRAINT pokemon_defense_check CHECK (((defense >= 1) AND (defense <= 255))),
    CONSTRAINT pokemon_hp_check CHECK (((hp >= 1) AND (hp <= 255))),
    CONSTRAINT pokemon_special_attack_check CHECK (((special_attack >= 1) AND (special_attack <= 255))),
    CONSTRAINT pokemon_special_defense_check CHECK (((special_defense >= 1) AND (special_defense <= 255))),
    CONSTRAINT pokemon_speed_check CHECK (((speed >= 1) AND (speed <= 255)))
);

CREATE SEQUENCE public.pokemon_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.pokemon_id_seq OWNED BY public.pokemon.id;

CREATE TABLE public.pokemon_species (
    pokedex_number integer NOT NULL,
    generation integer NOT NULL,
    legendary boolean NOT NULL,
    CONSTRAINT pokemon_species_generation_check CHECK (((generation >= 1) AND (generation <= 9))),
    CONSTRAINT pokemon_species_pokedex_number_check CHECK (((pokedex_number >= 1) AND (pokedex_number <= 1025)))
);

CREATE TABLE public.pokemon_types (
    pokemon_id integer NOT NULL,
    slot smallint NOT NULL,
    type public.pokemon_type NOT NULL,
    CONSTRAINT pokemon_types_slot_check CHECK ((slot = ANY (ARRAY[1, 2])))
);

CREATE TABLE public.todo_list_members (
    list_id text NOT NULL,
    public_key text NOT NULL
);

CREATE TABLE public.todo_lists (
    id text NOT NULL,
    name text NOT NULL,
    invite_code text NOT NULL
);

ALTER TABLE ONLY public.pokemon ALTER COLUMN id SET DEFAULT nextval('public.pokemon_id_seq'::regclass);

ALTER TABLE ONLY public.effect_sql_migrations
    ADD CONSTRAINT effect_sql_migrations_pkey PRIMARY KEY (migration_id);

ALTER TABLE ONLY public.pokemon
    ADD CONSTRAINT pokemon_name_key UNIQUE (name);

ALTER TABLE ONLY public.pokemon
    ADD CONSTRAINT pokemon_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.pokemon_species
    ADD CONSTRAINT pokemon_species_pkey PRIMARY KEY (pokedex_number);

ALTER TABLE ONLY public.pokemon_types
    ADD CONSTRAINT pokemon_types_pkey PRIMARY KEY (pokemon_id, slot);

ALTER TABLE ONLY public.pokemon_types
    ADD CONSTRAINT pokemon_types_pokemon_id_type_key UNIQUE (pokemon_id, type);

ALTER TABLE ONLY public.todo_list_members
    ADD CONSTRAINT todo_list_members_pkey PRIMARY KEY (list_id, public_key);

ALTER TABLE ONLY public.todo_lists
    ADD CONSTRAINT todo_lists_invite_code_key UNIQUE (invite_code);

ALTER TABLE ONLY public.todo_lists
    ADD CONSTRAINT todo_lists_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.pokemon
    ADD CONSTRAINT pokemon_pokedex_number_fkey FOREIGN KEY (pokedex_number) REFERENCES public.pokemon_species(pokedex_number);

ALTER TABLE ONLY public.pokemon_types
    ADD CONSTRAINT pokemon_types_pokemon_id_fkey FOREIGN KEY (pokemon_id) REFERENCES public.pokemon(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.todo_list_members
    ADD CONSTRAINT todo_list_members_list_id_fkey FOREIGN KEY (list_id) REFERENCES public.todo_lists(id);



INSERT INTO public.effect_sql_migrations (migration_id, created_at, name) VALUES (1, '2026-11-08 20:50:50.182043+00', 'todo_lists');
INSERT INTO public.effect_sql_migrations (migration_id, created_at, name) VALUES (2, '2026-11-08 20:50:50.182043+00', 'pokemon');


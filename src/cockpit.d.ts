/* This file is part of Cockpit.
 *
 * Copyright (C) 2024 Red Hat, Inc.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

declare module 'cockpit' {
    type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
    type JsonObject = Record<string, JsonValue>;

    class BasicError {
        problem: string;
        message: string;
        toString(): string;
    }

    /* === Events mix-in ========================= */

    interface EventMap {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        [_: string]: (...args: any[]) => void;
    }

    type EventListener<E extends (...args: unknown[]) => void> =
        (event: CustomEvent<Parameters<E>>, ...args: Parameters<E>) => void;

    interface EventSource<EM extends EventMap> {
        addEventListener<E extends keyof EM>(event: E, listener: EventListener<EM[E]>): void;
        removeEventListener<E extends keyof EM>(event: E, listener: EventListener<EM[E]>): void;
        dispatchEvent<E extends keyof EM>(event: E, ...args: Parameters<EM[E]>): void;
    }

    interface CockpitEvents extends EventMap {
        locationchanged(): void;
        visibilitychange(): void;
    }

    function addEventListener<E extends keyof CockpitEvents>(
        event: E, listener: EventListener<CockpitEvents[E]>
    ): void;
    function removeEventListener<E extends keyof CockpitEvents>(
        event: E, listener: EventListener<CockpitEvents[E]>
    ): void;

    interface ChangedEvents {
        changed(): void;
    }

    /* === Channel =============================== */

    interface ControlMessage extends JsonObject {
        command: string;
    }

    interface ChannelEvents<T> extends EventMap {
        control(options: JsonObject): void;
        ready(options: JsonObject): void;
        close(options: JsonObject): void;
        message(data: T): void;
    }

    interface Channel<T> extends EventSource<ChannelEvents<T>> {
        id: string | null;
        binary: boolean;
        options: JsonObject;
        valid: boolean;
        send(data: T): void;
        control(options: ControlMessage): void;
        wait(): Promise<void>;
        close(options?: JsonObject): void;
    }

    interface ChannelOptions {
        payload: string;
        superuser?: string;
        [_: string]: JsonValue | undefined;
    }

    function channel(options: ChannelOptions & { binary?: false; }): Channel<string>;
    function channel(options: ChannelOptions & { binary: true; }): Channel<Uint8Array>;

    /* === cockpit.location ========================== */

    export const location : {
        url_root: string;
        options: { [name: string]: string | Array<string> };
        path: Array<string>;
        href: string;
    };

    /* === cockpit.file ========================== */

    interface FileSyntaxObject<T, B> {
        parse(content: B): T;
        stringify(content: T): B;
    }

    type FileTag = string;

    type FileWatchCallback<T> = (data: T | null, tag: FileTag | null, error: BasicError | null) => void;
    interface FileWatchHandle {
        remove(): void;
    }

    interface FileHandle<T> {
        read(): Promise<T>;
        replace(content: T): Promise<FileTag>;
        watch(callback: FileWatchCallback<T>, options?: { read?: boolean }): FileWatchHandle;
        modify(callback: (data: T) => T): Promise<[T, FileTag]>;
        close(): void;
        path: string;
    }

    type FileOpenOptions = {
        max_read_size?: number;
        superuser?: string;
    };

    function file(
        path: string,
        options?: FileOpenOptions & { binary?: false; syntax?: undefined; }
    ): FileHandle<string>;
    function file(
        path: string,
        options: FileOpenOptions & { binary: true; syntax?: undefined; }
    ): FileHandle<Uint8Array>;
    function file<T>(
        path: string,
        options: FileOpenOptions & { binary?: false; syntax: FileSyntaxObject<T, string>; }
    ): FileHandle<T>;
    function file<T>(
        path: string,
        options: FileOpenOptions & { binary: true; syntax: FileSyntaxObject<T, Uint8Array>; }
    ): FileHandle<T>;

    /* === cockpit.user ========================== */

    type UserInfo = {
        id: number;
        name: string;
        full_name: string;
        groups: Array<string>;
        home: string;
        shell: string;
    };
    export function user(): Promise<UserInfo>;

    /* === String helpers ======================== */

    function gettext(message: string): string;
    function gettext(context: string, message?: string): string;
    function ngettext(message1: string, messageN: string, n: number): string;
    function ngettext(context: string, message1: string, messageN: string, n: number): string;

    function format_bytes(n: number): string;
    function format(format_string: string, ...args: unknown[]): string;
}

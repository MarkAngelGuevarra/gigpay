#![cfg(test)]

extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{Address as _, AuthorizedFunction, AuthorizedInvocation, EnvTestConfig, MockAuth, MockAuthInvoke},
    token, Address, Env, IntoVal, Symbol,
};

fn setup() -> (
    Env,
    GigPayEscrowClient<'static>,
    Address,
    token::Client<'static>,
    token::StellarAssetClient<'static>,
) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(GigPayEscrow, ());
    let client = GigPayEscrowClient::new(&env, &contract_id);

    let token_admin = Address::generate(&env);
    let token_sac = env.register_stellar_asset_contract_v2(token_admin);
    let token_address = token_sac.address();
    let token_client = token::Client::new(&env, &token_address);
    let token_admin_client = token::StellarAssetClient::new(&env, &token_address);

    (env, client, token_address, token_client, token_admin_client)
}

#[test]
fn test_escrow_happy_path_lifecycle() {
    let (env, client, token_address, token_client, token_admin) = setup();

    let client_addr = Address::generate(&env);
    let freelancer_addr = Address::generate(&env);
    let amount: i128 = 500_0000000; // 500 USDC (7 decimals)

    // Mint tokens to client
    token_admin.mint(&client_addr, &amount);
    assert_eq!(token_client.balance(&client_addr), amount);
    assert_eq!(token_client.balance(&client.address), 0);

    // 1. Client funds task
    let task_id = client.fund_task(&client_addr, &freelancer_addr, &token_address, &amount);
    assert_eq!(task_id, 1);

    // Tokens are locked in escrow contract
    assert_eq!(token_client.balance(&client_addr), 0);
    assert_eq!(token_client.balance(&client.address), amount);
    assert_eq!(token_client.balance(&freelancer_addr), 0);

    // Verify task state in storage
    let task = client.get_task(&task_id);
    assert_eq!(task.client, client_addr);
    assert_eq!(task.freelancer, freelancer_addr);
    assert_eq!(task.amount, amount);
    assert_eq!(task.token, token_address);
    assert!(task.is_funded);
    assert!(!task.is_approved);

    // 2. Client approves task
    client.approve_task(&task_id);

    // Escrow contract releases tokens to freelancer
    assert_eq!(token_client.balance(&client.address), 0);
    assert_eq!(token_client.balance(&freelancer_addr), amount);

    // Verify task state updated to approved
    let approved_task = client.get_task(&task_id);
    assert!(approved_task.is_approved);
}

#[test]
#[should_panic(expected = "Task already approved")]
fn test_double_approval_panics() {
    let (env, client, token_address, _token_client, token_admin) = setup();

    let client_addr = Address::generate(&env);
    let freelancer_addr = Address::generate(&env);
    let amount: i128 = 250_0000000;

    token_admin.mint(&client_addr, &amount);
    let task_id = client.fund_task(&client_addr, &freelancer_addr, &token_address, &amount);

    // First approval succeeds
    client.approve_task(&task_id);

    // Second approval must panic
    client.approve_task(&task_id);
}

#[test]
#[should_panic]
fn test_nonexistent_task_panics() {
    let (_env, client, _token_address, _token_client, _token_admin) = setup();

    // Approving non-existent task ID 999 must panic
    client.approve_task(&999);
}

#[test]
fn test_multiple_concurrent_tasks_isolation() {
    let (env, client, token_address, token_client, token_admin) = setup();

    let client_a = Address::generate(&env);
    let client_b = Address::generate(&env);
    let freelancer_x = Address::generate(&env);
    let freelancer_y = Address::generate(&env);

    let amount_a: i128 = 100_0000000;
    let amount_b: i128 = 200_0000000;

    token_admin.mint(&client_a, &amount_a);
    token_admin.mint(&client_b, &amount_b);

    // Fund Task 1
    let id_1 = client.fund_task(&client_a, &freelancer_x, &token_address, &amount_a);
    assert_eq!(id_1, 1);

    // Fund Task 2
    let id_2 = client.fund_task(&client_b, &freelancer_y, &token_address, &amount_b);
    assert_eq!(id_2, 2);

    // Escrow contract holds total combined balance
    assert_eq!(token_client.balance(&client.address), amount_a + amount_b);

    // Approve Task 2 first (out-of-order execution)
    client.approve_task(&id_2);

    assert_eq!(token_client.balance(&freelancer_y), amount_b);
    assert_eq!(token_client.balance(&freelancer_x), 0);
    assert_eq!(token_client.balance(&client.address), amount_a);

    let task_1 = client.get_task(&id_1);
    let task_2 = client.get_task(&id_2);
    assert!(!task_1.is_approved);
    assert!(task_2.is_approved);

    // Approve Task 1
    client.approve_task(&id_1);
    assert_eq!(token_client.balance(&freelancer_x), amount_a);
    assert_eq!(token_client.balance(&client.address), 0);
}

fn setup_unmocked() -> (
    Env,
    GigPayEscrowClient<'static>,
    Address,
    token::Client<'static>,
    token::StellarAssetClient<'static>,
    Address,
) {
    let env = Env::new_with_config(EnvTestConfig {
        capture_snapshot_at_drop: false,
    });
    let contract_id = env.register(GigPayEscrow, ());
    let client = GigPayEscrowClient::new(&env, &contract_id);

    let token_admin_addr = Address::generate(&env);
    let token_sac = env.register_stellar_asset_contract_v2(token_admin_addr.clone());
    let token_address = token_sac.address();
    let token_client = token::Client::new(&env, &token_address);
    let token_admin_client = token::StellarAssetClient::new(&env, &token_address);

    (
        env,
        client,
        token_address,
        token_client,
        token_admin_client,
        token_admin_addr,
    )
}

fn mock_mint_and_fund(
    env: &Env,
    client: &GigPayEscrowClient<'static>,
    token_address: &Address,
    token_admin: &token::StellarAssetClient<'static>,
    token_admin_addr: &Address,
    client_addr: &Address,
    freelancer_addr: &Address,
    amount: i128,
) -> u32 {
    env.mock_auths(&[MockAuth {
        address: token_admin_addr,
        invoke: &MockAuthInvoke {
            contract: token_address,
            fn_name: "mint",
            args: (client_addr, &amount).into_val(env),
            sub_invokes: &[],
        },
    }]);
    token_admin.mint(client_addr, &amount);

    env.mock_auths(&[MockAuth {
        address: client_addr,
        invoke: &MockAuthInvoke {
            contract: &client.address,
            fn_name: "fund_task",
            args: (client_addr, freelancer_addr, token_address, &amount).into_val(env),
            sub_invokes: &[MockAuthInvoke {
                contract: token_address,
                fn_name: "transfer",
                args: (client_addr, &client.address, &amount).into_val(env),
                sub_invokes: &[],
            }],
        },
    }]);
    client.fund_task(client_addr, freelancer_addr, token_address, &amount)
}

#[test]
#[should_panic]
fn test_fund_task_requires_client_auth() {
    let (env, client, token_address, _token_client, token_admin, token_admin_addr) =
        setup_unmocked();
    let client_addr = Address::generate(&env);
    let freelancer_addr = Address::generate(&env);
    let amount: i128 = 50_0000000;

    env.mock_auths(&[MockAuth {
        address: &token_admin_addr,
        invoke: &MockAuthInvoke {
            contract: &token_address,
            fn_name: "mint",
            args: (&client_addr, &amount).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    token_admin.mint(&client_addr, &amount);

    env.set_auths(&[]);
    client.fund_task(&client_addr, &freelancer_addr, &token_address, &amount);
}

#[test]
#[should_panic]
fn test_approve_task_requires_client_auth() {
    let (env, client, token_address, _token_client, token_admin, token_admin_addr) =
        setup_unmocked();
    let client_addr = Address::generate(&env);
    let freelancer_addr = Address::generate(&env);

    let task_id = mock_mint_and_fund(
        &env,
        &client,
        &token_address,
        &token_admin,
        &token_admin_addr,
        &client_addr,
        &freelancer_addr,
        100_0000000,
    );

    env.set_auths(&[]);
    client.approve_task(&task_id);
}

#[test]
#[should_panic]
fn test_approve_task_rejects_freelancer_auth() {
    let (env, client, token_address, _token_client, token_admin, token_admin_addr) =
        setup_unmocked();
    let client_addr = Address::generate(&env);
    let freelancer_addr = Address::generate(&env);

    let task_id = mock_mint_and_fund(
        &env,
        &client,
        &token_address,
        &token_admin,
        &token_admin_addr,
        &client_addr,
        &freelancer_addr,
        100_0000000,
    );

    env.mock_auths(&[MockAuth {
        address: &freelancer_addr,
        invoke: &MockAuthInvoke {
            contract: &client.address,
            fn_name: "approve_task",
            args: (&task_id,).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    client.approve_task(&task_id);
}

#[test]
fn test_approve_task_succeeds_with_exact_client_auth() {
    let (env, client, token_address, token_client, token_admin, token_admin_addr) =
        setup_unmocked();
    let client_addr = Address::generate(&env);
    let freelancer_addr = Address::generate(&env);
    let amount: i128 = 150_0000000;

    let task_id = mock_mint_and_fund(
        &env,
        &client,
        &token_address,
        &token_admin,
        &token_admin_addr,
        &client_addr,
        &freelancer_addr,
        amount,
    );

    env.mock_auths(&[MockAuth {
        address: &client_addr,
        invoke: &MockAuthInvoke {
            contract: &client.address,
            fn_name: "approve_task",
            args: (&task_id,).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    client.approve_task(&task_id);

    assert_eq!(token_client.balance(&client.address), 0);
    assert_eq!(token_client.balance(&freelancer_addr), amount);
    assert!(client.get_task(&task_id).is_approved);
}

#[test]
#[should_panic]
fn test_get_task_nonexistent_panics() {
    let env = Env::new_with_config(EnvTestConfig {
        capture_snapshot_at_drop: false,
    });
    let contract_id = env.register(GigPayEscrow, ());
    let client = GigPayEscrowClient::new(&env, &contract_id);
    client.get_task(&999);
}

#[test]
fn test_contract_records_client_authorizations_only() {
    let env = Env::new_with_config(EnvTestConfig {
        capture_snapshot_at_drop: false,
    });
    env.mock_all_auths();
    let contract_id = env.register(GigPayEscrow, ());
    let client = GigPayEscrowClient::new(&env, &contract_id);
    let token_admin_addr = Address::generate(&env);
    let token_sac = env.register_stellar_asset_contract_v2(token_admin_addr);
    let token_address = token_sac.address();
    let token_admin = token::StellarAssetClient::new(&env, &token_address);
    let client_addr = Address::generate(&env);
    let freelancer_addr = Address::generate(&env);
    let amount: i128 = 75_0000000;

    token_admin.mint(&client_addr, &amount);
    let task_id = client.fund_task(&client_addr, &freelancer_addr, &token_address, &amount);
    assert_eq!(
        env.auths(),
        [(
            client_addr.clone(),
            AuthorizedInvocation {
                function: AuthorizedFunction::Contract((
                    client.address.clone(),
                    Symbol::new(&env, "fund_task"),
                    (&client_addr, &freelancer_addr, &token_address, &amount).into_val(&env),
                )),
                sub_invocations: std::vec![AuthorizedInvocation {
                    function: AuthorizedFunction::Contract((
                        token_address.clone(),
                        Symbol::new(&env, "transfer"),
                        (&client_addr, &client.address, &amount).into_val(&env),
                    )),
                    sub_invocations: std::vec![],
                }],
            }
        )]
    );

    client.approve_task(&task_id);
    assert_eq!(
        env.auths(),
        [(
            client_addr.clone(),
            AuthorizedInvocation {
                function: AuthorizedFunction::Contract((
                    client.address.clone(),
                    Symbol::new(&env, "approve_task"),
                    (&task_id,).into_val(&env),
                )),
                sub_invocations: std::vec![],
            }
        )]
    );
}

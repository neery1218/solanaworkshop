use borsh::BorshDeserialize;
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    msg,
    program::invoke_signed,
    program_error::ProgramError,
    pubkey::Pubkey,
    system_instruction, system_program,
    sysvar::{rent::Rent, Sysvar},
};

use crate::instruction::EchoInstruction;
use crate::{error::EchoError, state::AuthorizedBufferHeader};

pub struct Processor {}
pub fn assert_with_msg(statement: bool, err: ProgramError, msg: &str) -> ProgramResult {
    if !statement {
        msg!(msg);
        Err(err)
    } else {
        Ok(())
    }
}

impl Processor {
    pub fn process_instruction(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        instruction_data: &[u8],
    ) -> ProgramResult {
        let instruction = EchoInstruction::try_from_slice(instruction_data)
            .map_err(|_| ProgramError::InvalidInstructionData)?;

        match instruction {
            EchoInstruction::Echo { data } => {
                msg!("Instruction: Echo");
                msg!("program id: {:?}", program_id);

                let accounts_iter = &mut accounts.iter();
                let echo_buffer = next_account_info(accounts_iter)?;
                let buf_size = echo_buffer.data.borrow().len();
                let mut mut_account_echo_buffer = echo_buffer.data.borrow_mut();

                // verify the buffer is allocated
                assert_with_msg(
                    buf_size > 0,
                    ProgramError::InvalidAccountData,
                    "Buffer is not allocated!",
                )?;

                // verify that the echobuffer is zeroed out.
                let mut buffer_is_empty = true;
                for i in 0..buf_size {
                    if mut_account_echo_buffer[i] != 0 {
                        buffer_is_empty = false;
                    }
                }

                assert_with_msg(
                    buffer_is_empty,
                    ProgramError::InvalidAccountData,
                    "Buffer is not empty!",
                )?;

                for i in 0..buf_size {
                    if i < data.len() {
                        mut_account_echo_buffer[i] = data[i];
                    }
                }
                Ok(())
            }
            EchoInstruction::InitializeAuthorizedEcho {
                buffer_seed,
                buffer_size,
            } => {
                msg!("Instruction: InitializeAuthorizedEcho");
                let accounts_iter = &mut accounts.iter();
                let authorized_buffer = next_account_info(accounts_iter)?;
                let authority = next_account_info(accounts_iter)?;
                let system_program = next_account_info(accounts_iter)?;

                assert_with_msg(authority.is_signer, ProgramError::InvalidAccountData, "Authority needs to sign!")?;
                assert_with_msg(
                    *system_program.key == system_program::ID,
                    ProgramError::InvalidAccountData,
                    "System program key is incorrect!",
                )?;

                let (authorized_buffer_key, bump_seed) = Pubkey::find_program_address(
                    &[
                        b"authority",
                        authority.key.as_ref(),
                        &buffer_seed.to_le_bytes(),
                    ],
                    program_id,
                );
                msg!(
                    "client's authority buffer: {:?} server's derived authority buffer: {:?}",
                    authorized_buffer.key,
                    authorized_buffer_key
                );

                assert_with_msg(
                    *authorized_buffer.key == authorized_buffer_key,
                    ProgramError::InvalidInstructionData,
                    "computed authorized buffer key does not match!",
                )?;

                // create buffer and initialize it to size buffer_size
                invoke_signed(
                    &system_instruction::create_account(
                        authority.key,
                        authorized_buffer.key,
                        Rent::get()?.minimum_balance(buffer_size),
                        buffer_size as u64,
                        program_id,
                    ),
                    &[
                        authority.clone(),
                        authorized_buffer.clone(),
                        system_program.clone(),
                    ],
                    &[&[
                        b"authority".as_ref(),
                        authority.key.as_ref(),
                        &buffer_seed.to_le_bytes(),
                        &[bump_seed],
                    ]],
                )?;

                let mut buf = authorized_buffer.data.borrow_mut();
                buf[0] = bump_seed;
                for (i, b) in buffer_seed.to_le_bytes().iter().enumerate() {
                    buf[1 + i] = *b;
                }
                Ok(())
            }
            EchoInstruction::AuthorizedEcho { data } => {
                msg!("Instruction: AuthorizedEcho");
                let accounts_iter = &mut accounts.iter();
                let authorized_buffer = next_account_info(accounts_iter)?;
                let authority = next_account_info(accounts_iter)?;

                assert_with_msg(authority.is_signer, ProgramError::InvalidAccountData, "Authority needs to sign!")?;

                // retrieve buffer seed from authorized_buffer
                let buf_header =
                    AuthorizedBufferHeader::try_from_slice(&authorized_buffer.data.borrow()[0..9])?;
                msg!("buf header: {:?}", buf_header);

                // authenticate the authority address. we should be able to generate
                // authorized_buffer given the bump seed, authority pubkey, and our program id
                let (generated_authorized_buffer_key, gen_bump_seed) = Pubkey::find_program_address(
                    &[
                        b"authority",
                        authority.key.as_ref(),
                        &buf_header.buffer_seed.to_le_bytes(),
                    ],
                    program_id,
                );
                msg!(
                    "generated auth buffer: {:?}",
                    generated_authorized_buffer_key
                );
                msg!("generated bump seed: {:?}", gen_bump_seed);
                assert_with_msg(
                    generated_authorized_buffer_key == *authorized_buffer.key,
                    ProgramError::InvalidAccountData,
                    "auth buffer mismatch!",
                )?;

                let mut buf = authorized_buffer.data.borrow_mut();
                // zero out the buffer
                for i in 9..buf.len() {
                    buf[i] = 0;
                }

                for (i, v) in data.iter().enumerate() {
                    if 9 + i < buf.len() {
                        buf[9 + i] = *v;
                    }
                }

                Ok(())
            }
            EchoInstruction::InitializeVendingMachineEcho {
                price: _,
                buffer_size: _,
            } => {
                msg!("Instruction: InitializeVendingMachineEcho");
                Err(EchoError::NotImplemented.into())
            }
            EchoInstruction::VendingMachineEcho { data: _ } => {
                msg!("Instruction: VendingMachineEcho");
                Err(EchoError::NotImplemented.into())
            }
        }
    }
}

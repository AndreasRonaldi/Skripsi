<?php

/**
 * SharIF Judge online judge
 * @file Recording.php
 * @author Andreas Ronaldi <andreasronaldi25@gmail.com>
 */
defined('BASEPATH') or exit('No direct script access allowed');

class Recording extends CI_Controller
{
	public function __construct()
	{
		parent::__construct();
		if (! $this->session->userdata('logged_in')) // if not logged in
			redirect('login');
		if ($this->user->level <= 1) // permission denied
			show_404();

		$this->load->model('recording_model');

		$input = $this->uri->uri_to_assoc();

		// var_dump($input);

		$this->filter_user = $this->filter_problem = NULL;
		if (array_key_exists('user', $input) && $input['user']) 
		$this->filter_user = $this->form_validation->alpha_numeric($input['user'])?$input['user']:NULL;
		if (array_key_exists('problem', $input) && $input['problem'])
		$this->filter_problem = is_numeric($input['problem'])?$input['problem']:NULL;
	}

	// For seeing all recording
	public function all()
	{
		$assignment_id = $this->user->selected_assignment['id'];

		if ($assignment_id == 0)
			show_error('No assignment selected.');
			
		$problem = $this->assignment_model->all_problems($assignment_id);
		$assignment = $this->assignment_model->assignment_info($assignment_id);
		$recordings = $this->recording_model->all_user_recordings($assignment_id, $this->filter_problem, $this->filter_user);
		$names = $this->user_model->get_names();

		foreach ($recordings as &$item) {
			$item['name'] = $names[$item['username']];
		}

		$data = array(
			'all_problems' => $problem,
			'assignment' => $assignment,
			'recordings' => $recordings,
			'filter_problem' => $this->filter_problem,
			'filter_user' => $this->filter_user,
		);

		$this->twig->display('pages/recording_list.twig', $data);
	}

	public function index($assignment_id = NULL, $problem_id = 1, $username = NULL, $rec_id = NULL)
	{
		// If no assignment is given
		if ($assignment_id === NULL)
			redirect('recording/all');

		if ($assignment_id == 0)
			show_error('No assignment selected.');

		$assignment = $this->assignment_model->assignment_info($assignment_id);

		$data = array(
			'all_problems' => $this->assignment_model->all_problems($assignment_id),
			'assignment' => $assignment,
			'filter_user' => $username,
			'filter_problem' => $problem_id,
		);

		if ($username !== NULL) {
			$list_rec = $this->recording_model->get_user_recordings($assignment_id, $problem_id, $username);
			$data['list_recording'] = $list_rec;

			if ($rec_id === NULL && $list_rec) {
				$rec_id = $list_rec[0]['rec_id'];
			}

			$data['rec_id'] = $rec_id;
		}

		$this->twig->display('pages/recording.twig', $data);
	}

	public function download_record($assignment_id, $problem_id, $username, $rec_id)
	{
		$assignment_root = rtrim($this->settings_model->get_setting('assignments_root'), '/');
		$file_path = $assignment_root.'/assignment_'.$assignment_id.'/p'.$problem_id.'/'.$username;
		$rec_path = $file_path.'/'.RECORD_FILE_NAME.'.'.RECORD_FILE_EXT;

		if ($rec_id !== "0") {
			$rec_path = $file_path.'/'.RECORD_FILE_NAME.'-'.$rec_id.'.'.RECORD_FILE_EXT;
		}

		$this->load->helper('file');
		$this->load->helper('url');

		if (!file_exists($rec_path)) {
			throw new Exception("File $rec_path does not exist");
		}
		if (!is_readable($rec_path)) {
			throw new Exception("File $rec_path is not readable");
		}

		$file = glob($rec_path);
		$content = file_get_contents($file[0]);
		header('Content-Type: application/json');
		header('Content-Disposition: attachment; filename="rec.json"');
		die($content);
	}
}
